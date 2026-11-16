-- Include half/period length on club scoreboard matches so Parent Hub recaps
-- show the real setup length instead of falling back to "1 min".

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

notify pgrst, 'reload schema';
