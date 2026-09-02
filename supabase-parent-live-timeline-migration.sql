-- Parent Hub timeline: include whistle period-end markers and positional moves.
-- Individual period_end sub_outs stay hidden in the client; they become one
-- "1st half ended" / "2nd half ended" card. position_change is shown live.

drop policy if exists "match_events_select_parent_live" on public.match_events;
create policy "match_events_select_parent_live"
  on public.match_events for select to anon
  using (
    exists (
      select 1
      from public.matches m
      join public.teams t on t.id = m.team_id
      where m.id = match_events.match_id
        and m.status = 'live'
        and coalesce(m.is_test, false) = false
        and t.active_status is distinct from false
        and match_events.event_type in (
          'goal',
          'opponent_goal',
          'yellow_card',
          'red_card',
          'sub_in',
          'sub_out',
          'position_change',
          'shot_home',
          'shot_away',
          'save_home',
          'save_away',
          'corner_home',
          'corner_away'
        )
    )
  );

create or replace function public.get_parent_live_events(p_match_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match public.matches%rowtype;
  v_events jsonb;
begin
  select m.*
  into v_match
  from public.matches m
  join public.teams t on t.id = m.team_id
  where m.id = p_match_id
    and m.status in ('live', 'final', 'pending_review')
    and coalesce(m.is_test, false) = false
    and t.active_status is distinct from false;

  if not found then
    return '[]'::jsonb;
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', e.id,
        'matchId', e.match_id,
        'playerId', e.player_id,
        'playerName', case
          when e.player_id is null then null
          else trim(both from coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, ''))
        end,
        'jersey', p.jersey,
        'eventType', e.event_type,
        'timestamp', e."timestamp",
        'eventNotes', e.event_notes,
        'isPk', e.is_pk,
        'assistPlayerId', e.assist_player_id,
        'assistPlayerName', case
          when e.assist_player_id is null then null
          else trim(both from coalesce(ap.first_name, '') || ' ' || coalesce(ap.last_name, ''))
        end,
        'createdAt', e.created_at
      )
      order by e."timestamp" asc, e.created_at asc
    ),
    '[]'::jsonb
  )
  into v_events
  from public.match_events e
  left join public.players p on p.id = e.player_id
  left join public.players ap on ap.id = e.assist_player_id
  where e.match_id = p_match_id
    and e.event_type in (
      'goal',
      'opponent_goal',
      'yellow_card',
      'red_card',
      'sub_in',
      'sub_out',
      'position_change',
      'shot_home',
      'shot_away',
      'save_home',
      'save_away',
      'corner_home',
      'corner_away'
    )
    and not (
      e.event_type = 'sub_out'
      and e."timestamp" <= 0
      and coalesce(e.event_notes, '') <> 'period_end'
    );

  return v_events;
end;
$$;

revoke all on function public.get_parent_live_events(uuid) from public;
grant execute on function public.get_parent_live_events(uuid) to anon, authenticated;

create or replace function public.get_parent_live_events(p_match_id uuid, p_include_test boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match public.matches%rowtype;
  v_events jsonb;
  v_include_test boolean := coalesce(p_include_test, false)
    and private.has_match_access(p_match_id);
begin
  select m.*
  into v_match
  from public.matches m
  join public.teams t on t.id = m.team_id
  where m.id = p_match_id
    and m.status in ('live', 'final', 'pending_review')
    and (
      coalesce(m.is_test, false) = false
      or v_include_test
    )
    and t.active_status is distinct from false;

  if not found then
    return '[]'::jsonb;
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', e.id,
        'matchId', e.match_id,
        'playerId', e.player_id,
        'playerName', case
          when e.player_id is null then null
          else trim(both from coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, ''))
        end,
        'jersey', p.jersey,
        'eventType', e.event_type,
        'timestamp', e."timestamp",
        'eventNotes', e.event_notes,
        'isPk', e.is_pk,
        'assistPlayerId', e.assist_player_id,
        'assistPlayerName', case
          when e.assist_player_id is null then null
          else trim(both from coalesce(ap.first_name, '') || ' ' || coalesce(ap.last_name, ''))
        end,
        'createdAt', e.created_at
      )
      order by e."timestamp" asc, e.created_at asc
    ),
    '[]'::jsonb
  )
  into v_events
  from public.match_events e
  left join public.players p on p.id = e.player_id
  left join public.players ap on ap.id = e.assist_player_id
  where e.match_id = p_match_id
    and e.event_type in (
      'goal',
      'opponent_goal',
      'yellow_card',
      'red_card',
      'sub_in',
      'sub_out',
      'position_change',
      'shot_home',
      'shot_away',
      'save_home',
      'save_away',
      'corner_home',
      'corner_away'
    )
    and not (
      e.event_type = 'sub_out'
      and e."timestamp" <= 0
      and coalesce(e.event_notes, '') <> 'period_end'
    );

  return v_events;
end;
$$;

revoke all on function public.get_parent_live_events(uuid, boolean) from public;
grant execute on function public.get_parent_live_events(uuid, boolean) to anon, authenticated;

notify pgrst, 'reload schema';
