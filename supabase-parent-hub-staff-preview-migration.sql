-- Staff can preview is_test matches on Parent Hub. Public / cached hub stays clean.
-- p_include_test is ignored unless the caller has team/match access (auth.uid()).

create or replace function public.get_parent_hub(p_team_id uuid, p_include_test boolean)
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
  v_include_test boolean := coalesce(p_include_test, false)
    and private.has_team_access(p_team_id);
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
      coalesce(mt.is_test, false) as "isTest",
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
      and (
        coalesce(mt.is_test, false) = false
        or v_include_test
      )
  ) m;

  return jsonb_build_object(
    'teamId', v_team.id,
    'teamSlug', v_team.slug,
    'teamName', v_team.name,
    'ageGroup', v_team.age_group,
    'brandColor', v_team.brand_color,
    'logoUrl', v_team.logo_url,
    'players', v_players,
    'matches', v_matches,
    'staffPreview', v_include_test
  );
end;
$$;

create or replace function public.get_parent_hub_by_slug(p_slug text, p_include_test boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_team_id uuid;
  v_slug text := lower(trim(coalesce(p_slug, '')));
begin
  if v_slug = '' then
    raise exception 'Team not found';
  end if;

  select t.id into v_team_id
  from public.teams t
  where t.slug = v_slug
    and t.active_status is distinct from false;

  if v_team_id is null then
    raise exception 'Team not found';
  end if;

  return public.get_parent_hub(v_team_id, p_include_test);
end;
$$;

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
    and coalesce(e.event_notes, '') <> 'period_end'
    and not (
      e.event_type = 'sub_out'
      and e."timestamp" <= 0
    );

  return v_events;
end;
$$;

revoke all on function public.get_parent_hub(uuid, boolean) from public;
grant execute on function public.get_parent_hub(uuid, boolean) to anon, authenticated;

revoke all on function public.get_parent_hub_by_slug(text, boolean) from public;
grant execute on function public.get_parent_hub_by_slug(text, boolean) to anon, authenticated;

revoke all on function public.get_parent_live_events(uuid, boolean) from public;
grant execute on function public.get_parent_live_events(uuid, boolean) to anon, authenticated;

notify pgrst, 'reload schema';
