-- Match lifecycle: scheduled → live → pending_review → final
-- Renames historical `active` → `live` and `completed` → `final`.
-- Default new matches to `scheduled` so preload never implies live state.

alter table public.matches drop constraint if exists matches_status_check;

update public.matches set status = 'live' where status = 'active';
update public.matches set status = 'final' where status = 'completed';

alter table public.matches
  alter column status set default 'scheduled';

alter table public.matches
  add constraint matches_status_check
  check (status in ('scheduled', 'live', 'pending_review', 'final'));

-- Parent Hub live feed / RLS: treat live matches as the in-progress state.
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
          'save_away'
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
      'save_away'
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

create or replace function public.get_parent_hub(p_team_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_team public.teams%rowtype;
  v_season_id uuid;
  v_players jsonb;
  v_matches jsonb;
begin
  select * into v_team
  from public.teams
  where id = p_team_id
    and active_status is distinct from false;

  if not found then
    raise exception 'Team not found';
  end if;

  select s.id into v_season_id
  from public.seasons s
  where s.status = 'active'
  order by s.created_at desc
  limit 1;

  if v_season_id is null then
    v_players := '[]'::jsonb;
  else
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', p.id,
          'firstName', p.first_name,
          'lastName', p.last_name,
          'number', coalesce(sr.primary_jersey_number, p.jersey)
        )
        order by coalesce(sr.primary_jersey_number, p.jersey) nulls last, p.last_name, p.first_name
      ),
      '[]'::jsonb
    )
    into v_players
    from public.season_rosters sr
    join public.players p on p.id = sr.player_id
    where sr.season_id = v_season_id
      and sr.team_id = p_team_id
      and p.active_status is distinct from false;
  end if;

  select coalesce(
    jsonb_agg(row_to_json(m)::jsonb order by m.sort_ts),
    '[]'::jsonb
  )
  into v_matches
  from (
    select
      mt.id,
      mt.opponent,
      mt.status,
      mt.match_date,
      mt.match_time,
      mt.date,
      case
        when lower(trim(coalesce(mt.location, ''))) = 'away' then 'away'
        else 'home'
      end as location_type,
      mt.home_score,
      mt.away_score,
      mt.home_pk_score,
      mt.away_pk_score,
      mt.pk_winner_is_us,
      mt.period,
      mt.current_period,
      mt.total_periods,
      mt.period_length,
      mt.half_length,
      mt.period_clock_started,
      mt.clock_seconds,
      mt.parent_facing_recap,
      coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'id', p.id,
              'firstName', p.first_name,
              'lastName', p.last_name,
              'number', p.jersey,
              'position', ms.match_position
            )
            order by p.jersey nulls last, p.last_name, p.first_name
          )
          from public.match_stats ms
          join public.players p on p.id = ms.player_id
          where ms.match_id = mt.id
            and ms.is_first_half_starter = true
            and ms.attending is distinct from false
        ),
        '[]'::jsonb
      ) as starters,
      coalesce(
        (mt.match_date::text || 'T' || coalesce(left(mt.match_time::text, 8), '12:00:00'))::timestamptz,
        mt.date
      ) as sort_ts
    from public.matches mt
    where mt.team_id = p_team_id
      and mt.status in ('live', 'scheduled', 'final', 'pending_review')
  ) m;

  return jsonb_build_object(
    'teamId', v_team.id,
    'teamSlug', v_team.slug,
    'teamName', v_team.name,
    'ageGroup', v_team.age_group,
    'brandColor', v_team.brand_color,
    'logoUrl', v_team.logo_url,
    'players', v_players,
    'matches', v_matches
  );
end;
$$;

revoke all on function public.get_parent_hub(uuid) from public;
grant execute on function public.get_parent_hub(uuid) to anon, authenticated;

-- Stat tracker writes only while the match is live.
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

  if v_status is distinct from 'live' then
    raise exception 'This match is no longer accepting sideline stats.';
  end if;

  if p_event_type not in (
    'stat_shot_on_target', 'stat_shot_off_target', 'stat_goal', 'stat_assist',
    'stat_dribble', 'stat_tackle', 'stat_save', 'stat_pass', 'stat_key_pass',
    'stat_team_log'
  ) then
    raise exception 'Unsupported sideline event type.';
  end if;

  insert into public.match_events (
    match_id,
    player_id,
    event_type,
    timestamp,
    event_notes,
    formation
  ) values (
    p_match_id,
    case when p_event_type = 'stat_team_log' then null else p_player_id end,
    p_event_type,
    greatest(p_timestamp, 0),
    p_event_notes,
    ''
  );
end;
$$;

notify pgrst, 'reload schema';
