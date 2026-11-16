-- Public club Parent Hub: resolve club vs team slug, club home payload, team detail.
-- Callable by anon (parents) and authenticated roles.

create or replace function public.resolve_parent_hub_slug(p_slug text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_slug text := lower(trim(coalesce(p_slug, '')));
  v_club public.clubs%rowtype;
  v_team public.teams%rowtype;
  v_team_club_slug text;
begin
  if v_slug = '' then
    raise exception 'Hub not found';
  end if;

  select * into v_club
  from public.clubs c
  where lower(c.slug) = v_slug
  limit 1;

  if found then
    return jsonb_build_object(
      'kind', 'club',
      'clubId', v_club.id,
      'clubSlug', v_club.slug,
      'clubName', v_club.name
    );
  end if;

  select * into v_team
  from public.teams t
  where t.slug = v_slug
    and t.active_status is distinct from false
  limit 1;

  if found then
    select c.slug into v_team_club_slug
    from public.clubs c
    where c.id = v_team.club_id
    limit 1;

    return jsonb_build_object(
      'kind', 'team',
      'teamId', v_team.id,
      'teamSlug', v_team.slug,
      'teamName', v_team.name,
      'clubId', v_team.club_id,
      'clubSlug', v_team_club_slug
    );
  end if;

  raise exception 'Hub not found';
end;
$$;

revoke all on function public.resolve_parent_hub_slug(text) from public;
grant execute on function public.resolve_parent_hub_slug(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Club hub home: seasons, teams + records, weekend matches (+ live now)
-- ---------------------------------------------------------------------------

create or replace function public.get_parent_club_hub(
  p_club_slug text,
  p_season_id uuid default null,
  p_weekend_start date default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_slug text := lower(trim(coalesce(p_club_slug, '')));
  v_club public.clubs%rowtype;
  v_season public.seasons%rowtype;
  v_weekend_start date;
  v_weekend_end date;
  v_seasons jsonb;
  v_teams jsonb;
  v_matches jsonb;
  v_live jsonb;
begin
  if v_slug = '' then
    raise exception 'Club not found';
  end if;

  select * into v_club
  from public.clubs c
  where lower(c.slug) = v_slug
  limit 1;

  if not found then
    raise exception 'Club not found';
  end if;

  if p_season_id is not null then
    select * into v_season
    from public.seasons s
    where s.id = p_season_id
      and s.club_id = v_club.id;
  else
    select * into v_season
    from public.seasons s
    where s.club_id = v_club.id
      and s.status = 'active'
    order by s.created_at desc
    limit 1;
  end if;

  if p_weekend_start is not null then
    v_weekend_start := p_weekend_start;
  else
    -- Mirror saturday-board weekendWindow: Sat–Sun of this/next weekend.
    v_weekend_start := (
      date_trunc('day', (current_timestamp at time zone 'America/New_York'))::date
      + case extract(dow from (current_timestamp at time zone 'America/New_York'))::int
          when 0 then -1
          when 6 then 0
          else (6 - extract(dow from (current_timestamp at time zone 'America/New_York'))::int)
        end
    );
  end if;
  v_weekend_end := v_weekend_start + 1;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', s.id,
        'name', s.name,
        'status', s.status,
        'startsOn', s.starts_on,
        'endsOn', s.ends_on
      )
      order by
        case when s.status = 'active' then 0 else 1 end,
        s.created_at desc
    ),
    '[]'::jsonb
  )
  into v_seasons
  from public.seasons s
  where s.club_id = v_club.id;

  if v_season.id is null then
    v_teams := '[]'::jsonb;
    v_matches := '[]'::jsonb;
    v_live := '[]'::jsonb;
  else
    select coalesce(
      jsonb_agg(row_to_json(t)::jsonb order by t.sort_name),
      '[]'::jsonb
    )
    into v_teams
    from (
      select
        tm.id,
        tm.slug,
        tm.name,
        tm.age_group as "ageGroup",
        tm.brand_color as "brandColor",
        tm.logo_url as "logoUrl",
        lower(tm.name) as sort_name,
        coalesce(rec.wins, 0) as wins,
        coalesce(rec.losses, 0) as losses,
        coalesce(rec.draws, 0) as draws,
        coalesce(rec.goals_for, 0) as "goalsFor",
        coalesce(rec.goals_against, 0) as "goalsAgainst",
        coalesce(rec.played, 0) as "matchesPlayed"
      from public.teams tm
      left join lateral (
        select
          count(*) filter (
            where m.status in ('final', 'pending_review')
              and (
                m.home_score > m.away_score
                or (m.home_score = m.away_score and m.pk_winner_is_us is true)
              )
          )::int as wins,
          count(*) filter (
            where m.status in ('final', 'pending_review')
              and (
                m.home_score < m.away_score
                or (m.home_score = m.away_score and m.pk_winner_is_us is false)
              )
          )::int as losses,
          count(*) filter (
            where m.status in ('final', 'pending_review')
              and m.home_score = m.away_score
              and m.pk_winner_is_us is null
          )::int as draws,
          coalesce(sum(m.home_score) filter (
            where m.status in ('final', 'pending_review')
          ), 0)::int as goals_for,
          coalesce(sum(m.away_score) filter (
            where m.status in ('final', 'pending_review')
          ), 0)::int as goals_against,
          count(*) filter (
            where m.status in ('final', 'pending_review')
          )::int as played
        from public.matches m
        where m.team_id = tm.id
          and m.season_id = v_season.id
          and coalesce(m.is_test, false) = false
      ) rec on true
      where tm.club_id = v_club.id
        and tm.active_status is distinct from false
    ) t;

    select coalesce(
      jsonb_agg(row_to_json(m)::jsonb order by m.sort_ts, m.team_name),
      '[]'::jsonb
    )
    into v_matches
    from (
      select
        mt.id,
        mt.team_id as "teamId",
        tm.slug as "teamSlug",
        tm.name as "teamName",
        tm.age_group as "ageGroup",
        mt.opponent,
        mt.status,
        mt.match_date as "matchDate",
        mt.match_time as "matchTime",
        mt.date,
        case
          when lower(trim(coalesce(mt.location, ''))) = 'away' then 'away'
          else 'home'
        end as "locationType",
        mt.home_score as "homeScore",
        mt.away_score as "awayScore",
        mt.home_pk_score as "homePkScore",
        mt.away_pk_score as "awayPkScore",
        mt.pk_winner_is_us as "pkWinnerIsUs",
        mt.period,
        mt.current_period as "currentPeriod",
        mt.total_periods as "totalPeriods",
        mt.period_length as "periodLength",
        mt.half_length as "halfLength",
        mt.period_clock_started as "periodClockStarted",
        mt.clock_seconds as "clockSeconds",
        mt.parent_facing_recap as "parentFacingRecap",
        coalesce(
          (mt.match_date::text || 'T' || coalesce(left(mt.match_time::text, 8), '12:00:00'))::timestamptz,
          mt.date
        ) as sort_ts,
        tm.name as team_name
      from public.matches mt
      join public.teams tm on tm.id = mt.team_id
      where mt.season_id = v_season.id
        and tm.club_id = v_club.id
        and tm.active_status is distinct from false
        and coalesce(mt.is_test, false) = false
        and mt.status in (
          'scheduled',
          'postponed',
          'cancelled',
          'live',
          'extra_time_first_half',
          'extra_time_second_half',
          'penalty_shootout',
          'final',
          'pending_review'
        )
        and coalesce(mt.match_date, mt.date::date) between v_weekend_start and v_weekend_end
        and (
          mt.status <> 'cancelled'
          or coalesce(mt.match_date, mt.date::date) >= (current_date - 2)
        )
    ) m;

    select coalesce(
      jsonb_agg(row_to_json(m)::jsonb order by m.sort_ts, m.team_name),
      '[]'::jsonb
    )
    into v_live
    from (
      select
        mt.id,
        mt.team_id as "teamId",
        tm.slug as "teamSlug",
        tm.name as "teamName",
        tm.age_group as "ageGroup",
        mt.opponent,
        mt.status,
        mt.match_date as "matchDate",
        mt.match_time as "matchTime",
        mt.date,
        case
          when lower(trim(coalesce(mt.location, ''))) = 'away' then 'away'
          else 'home'
        end as "locationType",
        mt.home_score as "homeScore",
        mt.away_score as "awayScore",
        mt.home_pk_score as "homePkScore",
        mt.away_pk_score as "awayPkScore",
        mt.pk_winner_is_us as "pkWinnerIsUs",
        mt.period,
        mt.current_period as "currentPeriod",
        mt.total_periods as "totalPeriods",
        mt.period_length as "periodLength",
        mt.half_length as "halfLength",
        mt.period_clock_started as "periodClockStarted",
        mt.clock_seconds as "clockSeconds",
        mt.parent_facing_recap as "parentFacingRecap",
        coalesce(
          (mt.match_date::text || 'T' || coalesce(left(mt.match_time::text, 8), '12:00:00'))::timestamptz,
          mt.date
        ) as sort_ts,
        tm.name as team_name
      from public.matches mt
      join public.teams tm on tm.id = mt.team_id
      where mt.season_id = v_season.id
        and tm.club_id = v_club.id
        and tm.active_status is distinct from false
        and coalesce(mt.is_test, false) = false
        and mt.status in (
          'live',
          'extra_time_first_half',
          'extra_time_second_half',
          'penalty_shootout'
        )
        and (
          coalesce(mt.match_date, mt.date::date) is null
          or coalesce(mt.match_date, mt.date::date) not between v_weekend_start and v_weekend_end
        )
    ) m;
  end if;

  return jsonb_build_object(
    'kind', 'club',
    'clubId', v_club.id,
    'clubSlug', v_club.slug,
    'clubName', v_club.name,
    'seasonId', v_season.id,
    'seasonName', v_season.name,
    'weekendStart', v_weekend_start,
    'weekendEnd', v_weekend_end,
    'seasons', v_seasons,
    'teams', coalesce(v_teams, '[]'::jsonb),
    'weekendMatches', coalesce(v_matches, '[]'::jsonb),
    'liveNowMatches', coalesce(v_live, '[]'::jsonb)
  );
end;
$$;

revoke all on function public.get_parent_club_hub(text, uuid, date) from public;
grant execute on function public.get_parent_club_hub(text, uuid, date) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Club team detail: coaches, roster, matches/recaps for a season
-- ---------------------------------------------------------------------------

create or replace function public.get_parent_club_team(
  p_club_slug text,
  p_team_slug text,
  p_season_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_club_slug text := lower(trim(coalesce(p_club_slug, '')));
  v_team_slug text := lower(trim(coalesce(p_team_slug, '')));
  v_club public.clubs%rowtype;
  v_team public.teams%rowtype;
  v_season public.seasons%rowtype;
  v_coaches jsonb;
  v_players jsonb;
  v_matches jsonb;
  v_wins int := 0;
  v_losses int := 0;
  v_draws int := 0;
  v_gf int := 0;
  v_ga int := 0;
  v_played int := 0;
begin
  if v_club_slug = '' or v_team_slug = '' then
    raise exception 'Team not found';
  end if;

  select * into v_club
  from public.clubs c
  where lower(c.slug) = v_club_slug
  limit 1;

  if not found then
    raise exception 'Club not found';
  end if;

  select * into v_team
  from public.teams t
  where t.slug = v_team_slug
    and t.club_id = v_club.id
    and t.active_status is distinct from false
  limit 1;

  if not found then
    raise exception 'Team not found';
  end if;

  if p_season_id is not null then
    select * into v_season
    from public.seasons s
    where s.id = p_season_id
      and s.club_id = v_club.id;
  else
    select * into v_season
    from public.seasons s
    where s.club_id = v_club.id
      and s.status = 'active'
    order by s.created_at desc
    limit 1;
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'name', x.display_name,
        'role', x.team_role
      )
      order by
        case when x.team_role::text = 'head_coach' then 0 else 1 end,
        x.display_name
    ),
    '[]'::jsonb
  )
  into v_coaches
  from (
    select
      nullif(trim(p.display_name), '') as display_name,
      tm.team_role
    from public.team_members tm
    join public.profiles p on p.id = tm.user_id
    where tm.team_id = v_team.id
      and nullif(trim(p.display_name), '') is not null
      and lower(coalesce(p.email, '')) <> 'gameday-e2e@virginiavelocity.com'
  ) x;

  if v_coaches = '[]'::jsonb
     and nullif(trim(v_team.primary_coach_name), '') is not null then
    v_coaches := jsonb_build_array(
      jsonb_build_object(
        'name', trim(v_team.primary_coach_name),
        'role', 'head_coach'
      )
    );
  end if;

  if v_season.id is null then
    v_players := '[]'::jsonb;
    v_matches := '[]'::jsonb;
  else
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', p.id,
          'firstName', p.first_name,
          'lastName', p.last_name,
          'number', coalesce(sr.primary_jersey_number, p.jersey),
          'position', coalesce(p.primary_position, p.position)
        )
        order by coalesce(sr.primary_jersey_number, p.jersey) nulls last, p.last_name, p.first_name
      ),
      '[]'::jsonb
    )
    into v_players
    from public.season_rosters sr
    join public.players p on p.id = sr.player_id
    where sr.season_id = v_season.id
      and sr.team_id = v_team.id
      and p.active_status is distinct from false;

    select
      count(*) filter (
        where mt.status in ('final', 'pending_review')
          and (
            mt.home_score > mt.away_score
            or (mt.home_score = mt.away_score and mt.pk_winner_is_us is true)
          )
      )::int,
      count(*) filter (
        where mt.status in ('final', 'pending_review')
          and (
            mt.home_score < mt.away_score
            or (mt.home_score = mt.away_score and mt.pk_winner_is_us is false)
          )
      )::int,
      count(*) filter (
        where mt.status in ('final', 'pending_review')
          and mt.home_score = mt.away_score
          and mt.pk_winner_is_us is null
      )::int,
      coalesce(sum(mt.home_score) filter (
        where mt.status in ('final', 'pending_review')
      ), 0)::int,
      coalesce(sum(mt.away_score) filter (
        where mt.status in ('final', 'pending_review')
      ), 0)::int,
      count(*) filter (
        where mt.status in ('final', 'pending_review')
      )::int
    into v_wins, v_losses, v_draws, v_gf, v_ga, v_played
    from public.matches mt
    where mt.team_id = v_team.id
      and mt.season_id = v_season.id
      and coalesce(mt.is_test, false) = false;

    select coalesce(
      jsonb_agg(row_to_json(m)::jsonb order by m.sort_ts desc),
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
        false as "isTest",
        coalesce(
          (mt.match_date::text || 'T' || coalesce(left(mt.match_time::text, 8), '12:00:00'))::timestamptz,
          mt.date
        ) as sort_ts
      from public.matches mt
      where mt.team_id = v_team.id
        and mt.season_id = v_season.id
        and coalesce(mt.is_test, false) = false
        and mt.status in (
          'scheduled',
          'postponed',
          'cancelled',
          'live',
          'extra_time_first_half',
          'extra_time_second_half',
          'penalty_shootout',
          'final',
          'pending_review'
        )
        and (
          mt.status <> 'cancelled'
          or coalesce(mt.match_date, mt.date::date) >= (current_date - 2)
        )
    ) m;
  end if;

  return jsonb_build_object(
    'kind', 'clubTeam',
    'clubId', v_club.id,
    'clubSlug', v_club.slug,
    'clubName', v_club.name,
    'teamId', v_team.id,
    'teamSlug', v_team.slug,
    'teamName', v_team.name,
    'ageGroup', v_team.age_group,
    'brandColor', v_team.brand_color,
    'logoUrl', v_team.logo_url,
    'seasonId', v_season.id,
    'seasonName', v_season.name,
    'wins', v_wins,
    'losses', v_losses,
    'draws', v_draws,
    'goalsFor', v_gf,
    'goalsAgainst', v_ga,
    'matchesPlayed', v_played,
    'coaches', coalesce(v_coaches, '[]'::jsonb),
    'players', coalesce(v_players, '[]'::jsonb),
    'matches', coalesce(v_matches, '[]'::jsonb)
  );
end;
$$;

revoke all on function public.get_parent_club_team(text, text, uuid) from public;
grant execute on function public.get_parent_club_team(text, text, uuid) to anon, authenticated;

notify pgrst, 'reload schema';
