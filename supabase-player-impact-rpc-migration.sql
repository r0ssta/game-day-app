-- Cumulative on-pitch Player Impact: goals and shots while a player was active.
-- Reconstructs Time On / Time Off intervals from sub_in / sub_out timestamps
-- (period-aware, matching the client timeline) and counts events strictly inside
-- those windows.

create index if not exists match_events_impact_match_type_idx
  on public.match_events (match_id, event_type, "timestamp");

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
  team_goals integer,
  opponent_goals integer,
  goal_plus_minus integer,
  team_shots integer,
  opponent_shots integer,
  net_shot_differential integer
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
        when oe."timestamp" < oe.prev_ts - 30 then 1
        when coalesce(oe.event_notes, '') like 'starting_lineup%'
          and oe.prev_ts > 30 then 1
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
  sub_intervals as (
    select
      i.match_id,
      i.player_id,
      i.abs_ts as time_on,
      coalesce(
        (
          select min(o.abs_ts)
          from abs_events o
          where o.match_id = i.match_id
            and o.player_id = i.player_id
            and o.event_type = 'sub_out'
            and o.abs_ts >= i.abs_ts
        ),
        me.match_end_ts
      ) as time_off
    from abs_events i
    join match_ends me on me.match_id = i.match_id
    where i.event_type = 'sub_in'
      and i.player_id is not null
  ),
  starter_intervals as (
    select
      ms.match_id,
      ms.player_id,
      0 as time_on,
      me.match_end_ts as time_off
    from public.match_stats ms
    join scoped_matches sm on sm.id = ms.match_id
    join match_ends me on me.match_id = ms.match_id
    where ms.attending
      and (ms.is_first_half_starter or ms.is_second_half_starter)
      and not exists (
        select 1
        from sub_intervals si
        where si.match_id = ms.match_id
          and si.player_id = ms.player_id
      )
  ),
  active_intervals as (
    select si.match_id, si.player_id, si.time_on, si.time_off
    from sub_intervals si
    where si.time_off > si.time_on
    union all
    select st.match_id, st.player_id, st.time_on, st.time_off
    from starter_intervals st
    where st.time_off > st.time_on
  ),
  counted_events as (
    select
      ae.match_id,
      ae.abs_ts,
      ae.event_type
    from abs_events ae
    where ae.event_type in ('goal', 'opponent_goal', 'shot_home', 'shot_away')
  ),
  interval_minutes as (
    select
      ai.player_id,
      ai.match_id,
      sum(ai.time_off - ai.time_on) as seconds_played
    from active_intervals ai
    group by ai.player_id, ai.match_id
  ),
  interval_events as (
    select
      ai.player_id,
      ai.match_id,
      count(*) filter (where ce.event_type = 'goal') as team_goals,
      count(*) filter (where ce.event_type = 'opponent_goal') as opponent_goals,
      count(*) filter (where ce.event_type = 'shot_home') as team_shots,
      count(*) filter (where ce.event_type = 'shot_away') as opponent_shots
    from active_intervals ai
    left join counted_events ce
      on ce.match_id = ai.match_id
      and ce.abs_ts > ai.time_on
      and ce.abs_ts < ai.time_off
    group by ai.player_id, ai.match_id
  ),
  interval_stats as (
    select
      im.player_id,
      im.match_id,
      im.seconds_played,
      coalesce(ie.team_goals, 0) as team_goals,
      coalesce(ie.opponent_goals, 0) as opponent_goals,
      coalesce(ie.team_shots, 0) as team_shots,
      coalesce(ie.opponent_shots, 0) as opponent_shots
    from interval_minutes im
    left join interval_events ie
      on ie.player_id = im.player_id
      and ie.match_id = im.match_id
  ),
  player_totals as (
    select
      ist.player_id,
      sm.team_id,
      count(*)::integer as matches_played,
      coalesce(sum(ist.seconds_played), 0)::integer as total_seconds_played,
      coalesce(sum(ist.team_goals), 0)::integer as team_goals,
      coalesce(sum(ist.opponent_goals), 0)::integer as opponent_goals,
      coalesce(sum(ist.team_shots), 0)::integer as team_shots,
      coalesce(sum(ist.opponent_shots), 0)::integer as opponent_shots
    from interval_stats ist
    join scoped_matches sm on sm.id = ist.match_id
    group by ist.player_id, sm.team_id
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
    coalesce(pt.team_goals, 0)::integer as team_goals,
    coalesce(pt.opponent_goals, 0)::integer as opponent_goals,
    (coalesce(pt.team_goals, 0) - coalesce(pt.opponent_goals, 0))::integer as goal_plus_minus,
    coalesce(pt.team_shots, 0)::integer as team_shots,
    coalesce(pt.opponent_shots, 0)::integer as opponent_shots,
    (coalesce(pt.team_shots, 0) - coalesce(pt.opponent_shots, 0))::integer as net_shot_differential
  from roster r
  left join player_totals pt
    on pt.player_id = r.player_id
    and pt.team_id = r.team_id
  order by
    (coalesce(pt.team_goals, 0) - coalesce(pt.opponent_goals, 0)) desc,
    (coalesce(pt.team_shots, 0) - coalesce(pt.opponent_shots, 0)) desc,
    r.last_name,
    r.first_name;
end;
$$;

revoke all on function public.calculate_player_impact(uuid, uuid) from public;
revoke all on function public.calculate_player_impact(uuid, uuid) from anon;
grant execute on function public.calculate_player_impact(uuid, uuid) to authenticated;

notify pgrst, 'reload schema';
