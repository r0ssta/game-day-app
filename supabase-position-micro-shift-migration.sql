-- 20-second micro-shift filter for positional playing time.
-- Quick tactical shuffles (pass-through slots during a sub) UPDATE the
-- player's latest position_change instead of inserting a new stint.

create index if not exists match_events_position_micro_shift_idx
  on public.match_events (match_id, player_id, created_at desc)
  where event_type = 'position_change';

create or replace function public.log_player_position_change(
  p_match_id uuid,
  p_player_id uuid,
  p_timestamp integer,
  p_event_notes text default null,
  p_formation text default null,
  p_window_seconds integer default 20
)
returns table (
  event_id uuid,
  merged boolean,
  previous_event_notes text,
  previous_formation text
)
language plpgsql
volatile
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_window integer;
  v_prev_id uuid;
  v_prev_timestamp integer;
  v_prev_created_at timestamptz;
  v_prev_notes text;
  v_prev_formation text;
  v_from text;
  v_to text;
  v_notes text;
  v_id uuid;
begin
  if not private.is_staff() then
    raise exception 'Staff access required'
      using errcode = '42501';
  end if;

  if p_match_id is null or p_player_id is null then
    raise exception 'match_id and player_id are required'
      using errcode = '22023';
  end if;

  v_window := greatest(coalesce(p_window_seconds, 20), 1);
  v_to := trim(coalesce(p_event_notes, ''));
  if v_to = '' then
    raise exception 'position is required'
      using errcode = '22023';
  end if;
  if strpos(v_to, '→') > 0 then
    v_to := trim(split_part(v_to, '→', 2));
  elsif strpos(v_to, '->') > 0 then
    v_to := trim(split_part(v_to, '->', 2));
  end if;
  if v_to = '' then
    raise exception 'position is required'
      using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(
    hashtext('pos:' || p_match_id::text),
    hashtext(p_player_id::text)
  );

  select
    e.id,
    e.timestamp,
    e.created_at,
    e.event_notes,
    e.formation
  into
    v_prev_id,
    v_prev_timestamp,
    v_prev_created_at,
    v_prev_notes,
    v_prev_formation
  from public.match_events e
  where e.match_id = p_match_id
    and e.player_id = p_player_id
    and e.event_type = 'position_change'
  order by e.created_at desc, e.timestamp desc
  limit 1;

  if v_prev_id is not null
     and (
       v_prev_created_at >= clock_timestamp() - make_interval(secs => v_window)
       or (
         p_timestamp >= v_prev_timestamp
         and (p_timestamp - v_prev_timestamp) < v_window
       )
     )
  then
    v_from := trim(coalesce(v_prev_notes, ''));
    if strpos(v_from, '→') > 0 then
      v_from := trim(split_part(v_from, '→', 1));
    elsif strpos(v_from, '->') > 0 then
      v_from := trim(split_part(v_from, '->', 1));
    else
      v_from := '';
    end if;

    if v_from <> '' and v_from <> v_to then
      v_notes := v_from || '→' || v_to;
    else
      v_notes := v_to;
    end if;

    update public.match_events
    set
      event_notes = v_notes,
      formation = coalesce(nullif(trim(coalesce(p_formation, '')), ''), formation)
    where public.match_events.id = v_prev_id;

    return query
    select v_prev_id, true, v_prev_notes, v_prev_formation;
    return;
  end if;

  v_notes := trim(coalesce(p_event_notes, v_to));
  if v_notes = '' then
    v_notes := v_to;
  end if;

  insert into public.match_events (
    match_id,
    player_id,
    event_type,
    timestamp,
    event_notes,
    formation,
    is_pk
  ) values (
    p_match_id,
    p_player_id,
    'position_change',
    greatest(p_timestamp, 0),
    v_notes,
    p_formation,
    false
  )
  returning id into v_id;

  return query
  select v_id, false, null::text, null::text;
end;
$$;

revoke all on function public.log_player_position_change(uuid, uuid, integer, text, text, integer) from public;
revoke all on function public.log_player_position_change(uuid, uuid, integer, text, text, integer) from anon;
grant execute on function public.log_player_position_change(uuid, uuid, integer, text, text, integer) to authenticated;

notify pgrst, 'reload schema';
