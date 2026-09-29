-- Coach yes/no: this goal was a direct result of the preceding corner.
-- Null means the question was not asked (older goals keep the clock fallback).
-- Safe to re-run.

alter table public.match_events
  add column if not exists from_corner boolean;

comment on column public.match_events.from_corner is
  'Coach answer: this goal was a direct result of the preceding corner. Null when not asked.';

alter table public.match_events
  drop constraint if exists match_events_from_corner_goal_check;

alter table public.match_events
  add constraint match_events_from_corner_goal_check
  check (
    from_corner is null
    or event_type in ('goal', 'opponent_goal')
  );

create or replace function public.get_parent_live_events(p_match_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_match public.matches%rowtype;
  v_events jsonb;
begin
  select m.*
  into v_match
  from public.matches m
  join public.teams t on t.id = m.team_id
  where m.id = p_match_id
    and m.status in (
      'live',
      'extra_time_first_half',
      'extra_time_second_half',
      'penalty_shootout',
      'final',
      'pending_review'
    )
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
        'fromCorner', e.from_corner,
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
      'corner_away',
      'pk_attempt'
    )
    and not (
      e.event_type = 'sub_out'
      and e."timestamp" <= 0
      and coalesce(e.event_notes, '') <> 'period_end'
    );

  return v_events;
end;
$function$;

create or replace function public.get_parent_live_events(p_match_id uuid, p_include_test boolean)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
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
    and m.status in (
      'live',
      'extra_time_first_half',
      'extra_time_second_half',
      'penalty_shootout',
      'final',
      'pending_review'
    )
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
        'fromCorner', e.from_corner,
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
      'corner_away',
      'pk_attempt'
    )
    and not (
      e.event_type = 'sub_out'
      and e."timestamp" <= 0
      and coalesce(e.event_notes, '') <> 'period_end'
    );

  return v_events;
end;
$function$;
