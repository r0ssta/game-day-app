-- Concurrent live-match sync:
-- 1. REPLICA IDENTITY FULL so Realtime `matches` UPDATEs include old score columns
--    (needed to ignore clock-heartbeat writes without a full hydrate).
-- 2. 3-second silent dedupe for sideline `log_stat_tracker_event` and a shared
--    checker used by the staff match API.
-- 3. Accept sideline stats for every in-progress status, not only `live`.

alter table public.matches replica identity full;

create index if not exists match_events_live_dedupe_idx
  on public.match_events (match_id, event_type, created_at desc);

create or replace function public.live_event_is_duplicate(
  p_match_id uuid,
  p_event_type text,
  p_player_id uuid default null,
  p_is_pk boolean default false,
  p_event_notes text default null,
  p_window_seconds integer default 3
)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
begin
  if p_match_id is null or p_event_type is null or length(trim(p_event_type)) = 0 then
    return false;
  end if;

  perform pg_advisory_xact_lock(
    hashtext('led:' || p_match_id::text),
    hashtext(
      p_event_type
      || ':'
      || coalesce(p_player_id::text, '')
      || ':'
      || coalesce(p_is_pk::text, 'f')
      || ':'
      || coalesce(p_event_notes, '')
    )
  );

  return exists (
    select 1
    from public.match_events e
    where e.match_id = p_match_id
      and e.event_type = p_event_type
      and e.player_id is not distinct from p_player_id
      and coalesce(e.is_pk, false) = coalesce(p_is_pk, false)
      and (
        p_event_notes is null
        or e.event_notes is not distinct from p_event_notes
      )
      and e.created_at >= now() - make_interval(secs => greatest(p_window_seconds, 1))
  );
end;
$$;

revoke all on function public.live_event_is_duplicate(uuid, text, uuid, boolean, text, integer) from public;
grant execute on function public.live_event_is_duplicate(uuid, text, uuid, boolean, text, integer) to authenticated;

create or replace function public.log_stat_tracker_event(
  p_match_id uuid,
  p_token text,
  p_event_type text,
  p_timestamp integer,
  p_player_id uuid default null,
  p_event_notes text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_player_id uuid;
begin
  if p_token is null or length(trim(p_token)) = 0 then
    raise exception 'Invalid or expired stat tracker link.';
  end if;

  if not exists (
    select 1
    from public.match_stat_trackers t
    where t.match_id = p_match_id
      and t.token = p_token
      and t.revoked_at is null
  ) then
    raise exception 'Invalid or expired stat tracker link.';
  end if;

  select m.status into v_status
  from public.matches m
  where m.id = p_match_id;

  if v_status not in (
    'live',
    'extra_time_first_half',
    'extra_time_second_half',
    'penalty_shootout'
  ) then
    raise exception 'This match is no longer accepting sideline stats.';
  end if;

  if p_event_type not in (
    'stat_shot_on_target', 'stat_shot_off_target', 'stat_goal', 'stat_assist',
    'stat_dribble', 'stat_tackle', 'stat_save', 'stat_pass', 'stat_key_pass',
    'stat_team_log'
  ) then
    raise exception 'Unsupported sideline event type.';
  end if;

  v_player_id := case when p_event_type = 'stat_team_log' then null else p_player_id end;

  if public.live_event_is_duplicate(
    p_match_id,
    p_event_type,
    v_player_id,
    false,
    p_event_notes,
    3
  ) then
    return;
  end if;

  insert into public.match_events (
    match_id, player_id, event_type, timestamp, event_notes, formation
  ) values (
    p_match_id,
    v_player_id,
    p_event_type,
    greatest(p_timestamp, 0),
    p_event_notes,
    ''
  );
end;
$$;

revoke all on function public.log_stat_tracker_event(uuid, text, text, integer, uuid, text) from public;
grant execute on function public.log_stat_tracker_event(uuid, text, text, integer, uuid, text) to anon, authenticated;
