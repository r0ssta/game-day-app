-- Split WPI into Offense (our goals/shots/corners) and Defense (their
-- events as a minus). Combined WPI is still Offense + Defense. Same
-- opponent-strength and coach-rating weights as before.

drop function if exists public.calculate_player_impact(uuid, uuid);

create or replace function public.calculate_player_impact(
  p_season_id uuid default null,
  p_team_id uuid default null
)
returns table (
  player_id uuid,
  first_name text,
  last_name text,
  jersey integer,
  team_id uuid,
  team_name text,
  matches_played integer,
  total_seconds_played integer,
  total_field_seconds integer,
  total_gk_seconds integer,
  team_goals integer,
  opponent_goals integer,
  goal_plus_minus integer,
  team_shots integer,
  opponent_shots integer,
  net_shot_differential integer,
  team_corners integer,
  opponent_corners integer,
  net_corner_differential integer,
  gk_goals_conceded integer,
  gk_saves integer,
  offensive_performance_index numeric,
  defensive_performance_index numeric,
  weighted_performance_index numeric
)
language plpgsql
stable
security invoker
set search_path = public
as $$
#variable_conflict use_column
begin
  if p_season_id is null and p_team_id is null then
    raise exception 'season_id or team_id is required'
      using errcode = '22023';
  end if;

  -- Read access matches the rest of the staff app: SECURITY INVOKER + RLS.
  -- Do not RAISE 42501 for team membership — coaches can open any team in the
  -- UI, and a hard fail shows "Failed to load player impact" instead of rows.

  return query
  with scoped_matches as (
    select
      m.id,
      m.team_id,
      m.season_id,
      m.opponent_strength,
      greatest(
        coalesce(m.period_length, m.half_length, 25),
        1
      ) * 60 as half_length_seconds,
      greatest(coalesce(m.total_periods, 2), 1) as total_periods
    from public.matches m
    where m.status in ('final', 'pending_review')
      and coalesce(m.is_test, false) = false
      and (p_season_id is null or m.season_id = p_season_id)
      and (p_team_id is null or m.team_id = p_team_id)
  ),
  roster as (
    select distinct on (sr.team_id, sr.player_id)
      sr.team_id,
      sr.player_id,
      sr.primary_jersey_number,
      p.first_name,
      p.last_name,
      p.jersey as pool_jersey,
      t.name as team_name
    from public.season_rosters sr
    join public.players p on p.id = sr.player_id
    join public.teams t on t.id = sr.team_id
    where (p_season_id is null or sr.season_id = p_season_id)
      and (p_team_id is null or sr.team_id = p_team_id)
    order by sr.team_id, sr.player_id, sr.created_at desc
  ),
  ordered_events as (
    select
      e.id,
      e.match_id,
      e.player_id,
      e.event_type,
      e.event_notes,
      e."timestamp",
      e.created_at,
      sm.half_length_seconds,
      lag(e."timestamp") over (
        partition by e.match_id
        order by e.created_at, e."timestamp", e.id
      ) as prev_ts
    from public.match_events e
    join scoped_matches sm on sm.id = e.match_id
  ),
  period_flags as (
    select
      oe.*,
      case
        when oe.prev_ts is null then 0
        when oe.event_type = 'sub_in'
          and coalesce(oe.event_notes, '') like 'starting_lineup%'
          and oe.prev_ts > 30 then 1
        when oe.event_type = 'sub_in'
          and oe."timestamp" <= 0
          and oe."timestamp" < oe.prev_ts - 30 then 1
        else 0
      end as new_period
    from ordered_events oe
  ),
  period_ids as (
    select
      pf.*,
      sum(pf.new_period) over (
        partition by pf.match_id
        order by pf.created_at, pf."timestamp", pf.id
      ) as period_idx
    from period_flags pf
  ),
  period_widths as (
    select
      pi.match_id,
      pi.period_idx,
      greatest(max(pi.half_length_seconds), max(pi."timestamp")) as width
    from period_ids pi
    group by pi.match_id, pi.period_idx
  ),
  period_offsets as (
    select
      pw.match_id,
      pw.period_idx,
      coalesce(
        sum(pw.width) over (
          partition by pw.match_id
          order by pw.period_idx
          rows between unbounded preceding and 1 preceding
        ),
        0
      ) as period_offset
    from period_widths pw
  ),
  abs_events as (
    select
      pi.id,
      pi.match_id,
      pi.player_id,
      pi.event_type,
      pi.event_notes,
      pi."timestamp",
      pi.created_at,
      po.period_offset + pi."timestamp" as abs_ts
    from period_ids pi
    join period_offsets po
      on po.match_id = pi.match_id
      and po.period_idx = pi.period_idx
  ),
  match_ends as (
    select
      sm.id as match_id,
      greatest(
        coalesce(max(ae.abs_ts), 0),
        sm.half_length_seconds * sm.total_periods
      ) as match_end_ts
    from scoped_matches sm
    left join abs_events ae on ae.match_id = sm.id
    group by sm.id, sm.half_length_seconds, sm.total_periods
  ),
  on_pitch_events as (
    select
      ae.id,
      ae.match_id,
      ae.player_id,
      ae.event_type,
      ae.event_notes,
      ae.abs_ts,
      ae.created_at,
      lead(ae.abs_ts) over (
        partition by ae.match_id, ae.player_id
        order by ae.created_at, ae.abs_ts, ae.id
      ) as next_abs_ts
    from abs_events ae
    where ae.player_id is not null
      and ae.event_type in ('sub_in', 'position_change', 'sub_out')
  ),
  positional_stints as (
    select
      ope.match_id,
      ope.player_id,
      ope.abs_ts as time_on,
      coalesce(ope.next_abs_ts, me.match_end_ts) as time_off,
      case
        when ope.event_notes is null then null
        when btrim(ope.event_notes) in ('', 'period_end', 'starting_lineup') then null
        when btrim(ope.event_notes) like 'starting_lineup|%' then
          nullif(
            btrim(substr(btrim(ope.event_notes), length('starting_lineup|') + 1)),
            ''
          )
        when position('→' in ope.event_notes) > 0 then
          nullif(btrim(regexp_replace(ope.event_notes, '^.*→\s*', '')), '')
        when position('->' in ope.event_notes) > 0 then
          nullif(btrim(regexp_replace(ope.event_notes, '^.*->\s*', '')), '')
        else btrim(ope.event_notes)
      end as position
    from on_pitch_events ope
    join match_ends me on me.match_id = ope.match_id
    where ope.event_type in ('sub_in', 'position_change')
  ),
  starter_intervals as (
    select
      ms.match_id,
      ms.player_id,
      0 as time_on,
      me.match_end_ts as time_off,
      ms.match_position as position
    from public.match_stats ms
    join scoped_matches sm on sm.id = ms.match_id
    join match_ends me on me.match_id = ms.match_id
    where ms.attending
      and (ms.is_first_half_starter or ms.is_second_half_starter)
      and not exists (
        select 1
        from positional_stints ps
        where ps.match_id = ms.match_id
          and ps.player_id = ms.player_id
      )
  ),
  active_intervals as (
    select
      s.match_id,
      s.player_id,
      s.time_on,
      s.time_off,
      (
        upper(coalesce(s.position, '')) in ('GK', 'KEEPER', 'GOALKEEPER')
        or upper(coalesce(s.position, '')) like '%GK%'
      ) as is_gk
    from (
      select ps.match_id, ps.player_id, ps.time_on, ps.time_off, ps.position
      from positional_stints ps
      union all
      select st.match_id, st.player_id, st.time_on, st.time_off, st.position
      from starter_intervals st
    ) s
    where s.time_off > s.time_on
  ),
  counted_events as (
    select
      ae.match_id,
      ae.abs_ts,
      ae.event_type
    from abs_events ae
    where ae.event_type in (
      'goal',
      'opponent_goal',
      'shot_home',
      'shot_away',
      'corner_home',
      'corner_away',
      'save_home'
    )
  ),
  interval_minutes as (
    select
      ai.player_id,
      ai.match_id,
      ai.is_gk,
      sum(ai.time_off - ai.time_on) as seconds_played
    from active_intervals ai
    group by ai.player_id, ai.match_id, ai.is_gk
  ),
  interval_events as (
    select
      ai.player_id,
      ai.match_id,
      ai.is_gk,
      count(*) filter (where ce.event_type = 'goal') as team_goals,
      count(*) filter (where ce.event_type = 'opponent_goal') as opponent_goals,
      count(*) filter (where ce.event_type = 'shot_home') as team_shots,
      count(*) filter (where ce.event_type = 'shot_away') as opponent_shots,
      count(*) filter (where ce.event_type = 'corner_home') as team_corners,
      count(*) filter (where ce.event_type = 'corner_away') as opponent_corners,
      count(*) filter (where ce.event_type = 'save_home') as saves
    from active_intervals ai
    left join counted_events ce
      on ce.match_id = ai.match_id
      and ce.abs_ts > ai.time_on
      and ce.abs_ts < ai.time_off
    group by ai.player_id, ai.match_id, ai.is_gk
  ),
  interval_stats as (
    select
      im.player_id,
      im.match_id,
      im.is_gk,
      im.seconds_played,
      coalesce(ie.team_goals, 0) as team_goals,
      coalesce(ie.opponent_goals, 0) as opponent_goals,
      coalesce(ie.team_shots, 0) as team_shots,
      coalesce(ie.opponent_shots, 0) as opponent_shots,
      coalesce(ie.team_corners, 0) as team_corners,
      coalesce(ie.opponent_corners, 0) as opponent_corners,
      coalesce(ie.saves, 0) as saves
    from interval_minutes im
    left join interval_events ie
      on ie.player_id = im.player_id
      and ie.match_id = im.match_id
      and ie.is_gk = im.is_gk
  ),
  match_field_stats as (
    select
      ist.player_id,
      ist.match_id,
      sm.team_id,
      sm.opponent_strength,
      coalesce(sum(ist.seconds_played), 0)::integer as seconds_played,
      coalesce(sum(ist.seconds_played) filter (where not ist.is_gk), 0)::integer
        as field_seconds,
      coalesce(sum(ist.seconds_played) filter (where ist.is_gk), 0)::integer
        as gk_seconds,
      coalesce(sum(ist.team_goals) filter (where not ist.is_gk), 0)::integer as team_goals,
      coalesce(sum(ist.opponent_goals) filter (where not ist.is_gk), 0)::integer
        as opponent_goals,
      coalesce(sum(ist.team_shots) filter (where not ist.is_gk), 0)::integer as team_shots,
      coalesce(sum(ist.opponent_shots) filter (where not ist.is_gk), 0)::integer
        as opponent_shots,
      coalesce(sum(ist.team_corners) filter (where not ist.is_gk), 0)::integer as team_corners,
      coalesce(sum(ist.opponent_corners) filter (where not ist.is_gk), 0)::integer
        as opponent_corners,
      coalesce(sum(ist.opponent_goals) filter (where ist.is_gk), 0)::integer
        as gk_goals_conceded,
      coalesce(sum(ist.saves) filter (where ist.is_gk), 0)::integer as gk_saves
    from interval_stats ist
    join scoped_matches sm on sm.id = ist.match_id
    group by ist.player_id, ist.match_id, sm.team_id, sm.opponent_strength
  ),
  match_reviews_agg as (
    select
      mr.match_id,
      mr.player_id,
      coalesce(
        max(mr.rating) filter (where lower(btrim(mr.position)) = 'overall'),
        avg(mr.rating)
      ) as coach_rating
    from public.match_reviews mr
    join scoped_matches sm on sm.id = mr.match_id
    group by mr.match_id, mr.player_id
  ),
  match_weights as (
    select
      mfs.*,
      mra.coach_rating,
      (
        case mfs.opponent_strength
          when 'better' then 1.5
          when 'lesser' then 0.5
          else 1.0
        end
        * (coalesce(mra.coach_rating, 3)::numeric / 3.0)
      ) as wpi_weight
    from match_field_stats mfs
    left join match_reviews_agg mra
      on mra.match_id = mfs.match_id
      and mra.player_id = mfs.player_id
  ),
  match_weighted as (
    select
      mw.*,
      (mw.team_goals + mw.team_shots + mw.team_corners) * mw.wpi_weight
        as weighted_offense,
      -1 * (mw.opponent_goals + mw.opponent_shots + mw.opponent_corners) * mw.wpi_weight
        as weighted_defense,
      (
        (mw.team_goals - mw.opponent_goals)
        + (mw.team_shots - mw.opponent_shots)
        + (mw.team_corners - mw.opponent_corners)
      ) * mw.wpi_weight as weighted_net_shots
    from match_weights mw
  ),
  player_totals as (
    select
      mw.player_id,
      mw.team_id,
      count(distinct mw.match_id)::integer as matches_played,
      coalesce(sum(mw.seconds_played), 0)::integer as total_seconds_played,
      coalesce(sum(mw.field_seconds), 0)::integer as total_field_seconds,
      coalesce(sum(mw.gk_seconds), 0)::integer as total_gk_seconds,
      coalesce(sum(mw.team_goals), 0)::integer as team_goals,
      coalesce(sum(mw.opponent_goals), 0)::integer as opponent_goals,
      coalesce(sum(mw.team_shots), 0)::integer as team_shots,
      coalesce(sum(mw.opponent_shots), 0)::integer as opponent_shots,
      coalesce(sum(mw.team_corners), 0)::integer as team_corners,
      coalesce(sum(mw.opponent_corners), 0)::integer as opponent_corners,
      coalesce(sum(mw.gk_goals_conceded), 0)::integer as gk_goals_conceded,
      coalesce(sum(mw.gk_saves), 0)::integer as gk_saves,
      round(coalesce(sum(mw.weighted_offense), 0), 1) as offensive_performance_index,
      round(coalesce(sum(mw.weighted_defense), 0), 1) as defensive_performance_index,
      round(coalesce(sum(mw.weighted_net_shots), 0), 1) as weighted_performance_index
    from match_weighted mw
    group by mw.player_id, mw.team_id
  )
  select
    r.player_id,
    r.first_name,
    r.last_name,
    coalesce(r.primary_jersey_number, r.pool_jersey) as jersey,
    r.team_id,
    r.team_name,
    coalesce(pt.matches_played, 0)::integer as matches_played,
    coalesce(pt.total_seconds_played, 0)::integer as total_seconds_played,
    coalesce(pt.total_field_seconds, 0)::integer as total_field_seconds,
    coalesce(pt.total_gk_seconds, 0)::integer as total_gk_seconds,
    coalesce(pt.team_goals, 0)::integer as team_goals,
    coalesce(pt.opponent_goals, 0)::integer as opponent_goals,
    (coalesce(pt.team_goals, 0) - coalesce(pt.opponent_goals, 0))::integer as goal_plus_minus,
    coalesce(pt.team_shots, 0)::integer as team_shots,
    coalesce(pt.opponent_shots, 0)::integer as opponent_shots,
    (coalesce(pt.team_shots, 0) - coalesce(pt.opponent_shots, 0))::integer
      as net_shot_differential,
    coalesce(pt.team_corners, 0)::integer as team_corners,
    coalesce(pt.opponent_corners, 0)::integer as opponent_corners,
    (coalesce(pt.team_corners, 0) - coalesce(pt.opponent_corners, 0))::integer
      as net_corner_differential,
    coalesce(pt.gk_goals_conceded, 0)::integer as gk_goals_conceded,
    coalesce(pt.gk_saves, 0)::integer as gk_saves,
    coalesce(pt.offensive_performance_index, 0)::numeric as offensive_performance_index,
    coalesce(pt.defensive_performance_index, 0)::numeric as defensive_performance_index,
    coalesce(pt.weighted_performance_index, 0)::numeric as weighted_performance_index
  from roster r
  left join player_totals pt
    on pt.player_id = r.player_id
    and pt.team_id = r.team_id
  order by
    (coalesce(pt.team_goals, 0) - coalesce(pt.opponent_goals, 0)) desc,
    (coalesce(pt.team_shots, 0) - coalesce(pt.opponent_shots, 0)) desc,
    (coalesce(pt.team_corners, 0) - coalesce(pt.opponent_corners, 0)) desc,
    r.last_name,
    r.first_name;
end;
$$;

revoke all on function public.calculate_player_impact(uuid, uuid) from public;
revoke all on function public.calculate_player_impact(uuid, uuid) from anon;
grant execute on function public.calculate_player_impact(uuid, uuid) to authenticated;

notify pgrst, 'reload schema';
