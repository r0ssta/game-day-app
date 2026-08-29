-- Team corner kick events (Home = us, Away = opponent).

alter table public.match_events
  drop constraint if exists match_events_event_type_check;

alter table public.match_events
  add constraint match_events_event_type_check
  check (event_type in (
    'goal',
    'assist',
    'sub_in',
    'sub_out',
    'position_change',
    'opponent_goal',
    'formation_change',
    'stat_shot_on_target',
    'stat_shot_off_target',
    'stat_goal',
    'stat_assist',
    'stat_dribble',
    'stat_tackle',
    'stat_save',
    'stat_pass',
    'stat_key_pass',
    'stat_team_log',
    'pk_attempt',
    'yellow_card',
    'red_card',
    'shot_home',
    'shot_away',
    'save_home',
    'save_away',
    'corner_home',
    'corner_away'
  ));

alter table public.match_events
  drop constraint if exists match_events_player_required_check;

alter table public.match_events
  add constraint match_events_player_required_check
  check (
    event_type in (
      'opponent_goal',
      'formation_change',
      'stat_team_log',
      'pk_attempt',
      'shot_home',
      'shot_away',
      'save_home',
      'save_away',
      'corner_home',
      'corner_away'
    )
    or player_id is not null
  );

-- Parent Hub live feed: allow corner events for anon select + RPC hydrate.
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
        and t.active_status is distinct from false
        and match_events.event_type in (
          'goal',
          'opponent_goal',
          'yellow_card',
          'red_card',
          'sub_in',
          'sub_out',
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
  select * into v_match
  from public.matches
  where id = p_match_id
    and status = 'live';

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
      'shot_home',
      'shot_away',
      'save_home',
      'save_away',
      'corner_home',
      'corner_away'
    )
    and coalesce(e.event_notes, '') <> 'period_end'
    and not (
      e.event_type = 'sub_out'
      and e."timestamp" <= 0
    );

  return v_events;
end;
$$;

revoke all on function public.get_parent_live_events(uuid) from public;
grant execute on function public.get_parent_live_events(uuid) to anon, authenticated;
