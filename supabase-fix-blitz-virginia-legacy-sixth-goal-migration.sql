-- One-time correction: Blitz vs U11 Virginia Legacy (2026-11-01) 6th goal
-- was logged as Brooks Gilmore (assist Owen Lombard); correct to Nico Baldini
-- assisted by Schneider Aguilera. Also retarget the paired shot_home row.
-- Idempotent: no-op when goal #6 is already Nico + Schneider or no match found.

do $$
declare
  v_match_id uuid;
  v_goal_id uuid;
  v_goal_ts integer;
  v_old_scorer uuid;
  v_scorer_id uuid;
  v_assist_id uuid;
  v_nico_id uuid;
  v_schneider_id uuid;
  v_shot_updated integer := 0;
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
    raise notice 'Blitz 6th goal fix: no Blitz vs Virginia Legacy match on 2026-11-01, skipping';
    return;
  end if;

  select p.id
  into v_nico_id
  from public.season_rosters sr
  join public.players p on p.id = sr.player_id
  where sr.team_id = (select team_id from public.matches where id = v_match_id)
    and lower(p.first_name) = 'nico'
  order by p.created_at
  limit 1;

  select p.id
  into v_schneider_id
  from public.season_rosters sr
  join public.players p on p.id = sr.player_id
  where sr.team_id = (select team_id from public.matches where id = v_match_id)
    and lower(p.first_name) = 'schneider'
  order by p.created_at
  limit 1;

  if v_nico_id is null or v_schneider_id is null then
    raise exception 'Blitz 6th goal fix: could not resolve Nico (%) or Schneider (%) on roster',
      v_nico_id, v_schneider_id;
  end if;

  select e.id, e.timestamp, e.player_id, e.assist_player_id
  into v_goal_id, v_goal_ts, v_scorer_id, v_assist_id
  from (
    select id, timestamp, player_id, assist_player_id,
      row_number() over (order by timestamp nulls last, created_at) as goal_num
    from public.match_events
    where match_id = v_match_id
      and event_type = 'goal'
  ) e
  where e.goal_num = 6;

  if v_goal_id is null then
    raise notice 'Blitz 6th goal fix: goal #6 not found on match %, skipping', v_match_id;
    return;
  end if;

  if v_scorer_id = v_nico_id and v_assist_id = v_schneider_id then
    raise notice 'Blitz 6th goal fix: goal % already Nico assisted by Schneider, skipping', v_goal_id;
    return;
  end if;

  v_old_scorer := v_scorer_id;

  update public.match_events
  set player_id = v_nico_id,
      assist_player_id = v_schneider_id
  where id = v_goal_id;

  update public.match_events
  set player_id = v_nico_id
  where match_id = v_match_id
    and event_type = 'shot_home'
    and timestamp = v_goal_ts
    and (player_id = v_old_scorer or player_id = v_nico_id);

  get diagnostics v_shot_updated = row_count;

  raise notice 'Blitz 6th goal fix: goal % -> Nico + Schneider assist; shot rows touched: %',
    v_goal_id, v_shot_updated;
end $$;
