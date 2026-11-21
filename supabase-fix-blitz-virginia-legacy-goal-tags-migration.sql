-- One-time correction: Blitz vs U11 Virginia Legacy (2026-11-01)
-- Goal #4 (end of 1st half, by created_at order) must be Brooks Gilmore
-- assisted by Owen Lombard (was wrongly retagged to Nico / Schneider).
-- Goal #7 must be Nico Baldini (was Schneider Aguilera).
-- Also retarget paired shot_home rows at the same timestamps.
-- Idempotent: no-op when both goals already match the expected scorers.

do $$
declare
  v_match_id uuid;
  v_brooks_id uuid;
  v_owen_id uuid;
  v_nico_id uuid;
  v_goal4_id uuid;
  v_goal4_ts integer;
  v_goal4_scorer uuid;
  v_goal4_assist uuid;
  v_goal7_id uuid;
  v_goal7_ts integer;
  v_goal7_scorer uuid;
  v_shot4_updated integer := 0;
  v_shot7_updated integer := 0;
begin
  select m.id
  into v_match_id
  from public.matches m
  join public.teams t on t.id = m.team_id
  where lower(t.name) = 'blitz'
    and t.age_group = 'U11'
    and coalesce(m.is_test, false) = false
    and lower(trim(m.opponent)) like '%virginia legacy%'
    and coalesce(m.match_date, (m.date at time zone 'utc')::date) = date '2026-11-01'
  order by m.date desc
  limit 1;

  if v_match_id is null then
    raise notice 'Blitz goal-tag fix: no Blitz vs Virginia Legacy match on 2026-11-01, skipping';
    return;
  end if;

  select p.id
  into v_brooks_id
  from public.season_rosters sr
  join public.players p on p.id = sr.player_id
  where sr.team_id = (select team_id from public.matches where id = v_match_id)
    and lower(p.first_name) = 'brooks'
  order by p.created_at
  limit 1;

  select p.id
  into v_owen_id
  from public.season_rosters sr
  join public.players p on p.id = sr.player_id
  where sr.team_id = (select team_id from public.matches where id = v_match_id)
    and lower(p.first_name) = 'owen'
  order by p.created_at
  limit 1;

  select p.id
  into v_nico_id
  from public.season_rosters sr
  join public.players p on p.id = sr.player_id
  where sr.team_id = (select team_id from public.matches where id = v_match_id)
    and lower(p.first_name) = 'nico'
  order by p.created_at
  limit 1;

  if v_brooks_id is null or v_owen_id is null or v_nico_id is null then
    raise exception 'Blitz goal-tag fix: could not resolve Brooks (%), Owen (%), or Nico (%) on roster',
      v_brooks_id, v_owen_id, v_nico_id;
  end if;

  -- Number Blitz goals by wall-clock logging order (created_at), which matches
  -- half sequence for this match (1H goals logged before 2H). Do not use raw
  -- timestamp alone: the match clock resets each half.
  select e.id, e.timestamp, e.player_id, e.assist_player_id
  into v_goal4_id, v_goal4_ts, v_goal4_scorer, v_goal4_assist
  from (
    select id, timestamp, player_id, assist_player_id,
      row_number() over (order by created_at) as goal_num
    from public.match_events
    where match_id = v_match_id
      and event_type = 'goal'
  ) e
  where e.goal_num = 4;

  select e.id, e.timestamp, e.player_id
  into v_goal7_id, v_goal7_ts, v_goal7_scorer
  from (
    select id, timestamp, player_id,
      row_number() over (order by created_at) as goal_num
    from public.match_events
    where match_id = v_match_id
      and event_type = 'goal'
  ) e
  where e.goal_num = 7;

  if v_goal4_id is null or v_goal7_id is null then
    raise notice 'Blitz goal-tag fix: goal #4 (%) or #7 (%) missing on match %, skipping',
      v_goal4_id, v_goal7_id, v_match_id;
    return;
  end if;

  if v_goal4_scorer = v_brooks_id
     and v_goal4_assist = v_owen_id
     and v_goal7_scorer = v_nico_id then
    raise notice 'Blitz goal-tag fix: goals already Brooks/Owen (#4) and Nico (#7), skipping';
    return;
  end if;

  update public.match_events
  set player_id = v_brooks_id,
      assist_player_id = v_owen_id
  where id = v_goal4_id;

  update public.match_events
  set player_id = v_brooks_id
  where match_id = v_match_id
    and event_type = 'shot_home'
    and timestamp = v_goal4_ts
    and (
      player_id = v_goal4_scorer
      or player_id = v_brooks_id
      or player_id = v_nico_id
    );
  get diagnostics v_shot4_updated = row_count;

  update public.match_events
  set player_id = v_nico_id
  where id = v_goal7_id;

  update public.match_events
  set player_id = v_nico_id
  where match_id = v_match_id
    and event_type = 'shot_home'
    and timestamp = v_goal7_ts
    and (player_id = v_goal7_scorer or player_id = v_nico_id);
  get diagnostics v_shot7_updated = row_count;

  raise notice 'Blitz goal-tag fix: #4 % -> Brooks + Owen (shots %); #7 % -> Nico (shots %)',
    v_goal4_id, v_shot4_updated, v_goal7_id, v_shot7_updated;
end $$;
