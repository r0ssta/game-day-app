-- One-time correction: U13 Maroon final match scored 8-1 should be 8-0 (disallowed opponent goal).
-- Idempotent: no-op when the match is already 8-0 or no matching row exists.

do $$
declare
  v_match_id uuid;
  v_goal_id uuid;
  v_goal_ts integer;
begin
  select m.id
  into v_match_id
  from public.matches m
  join public.teams t on t.id = m.team_id
  where lower(t.name) like '%maroon%'
    and t.age_group = 'U13'
    and m.status = 'final'
    and m.home_score = 8
    and m.away_score = 1
    and coalesce(m.match_date, (m.date at time zone 'utc')::date) = date '2026-08-29'
  order by m.date desc
  limit 1;

  if v_match_id is null then
    raise notice 'U13 Maroon 8-0 fix: no 8-1 final match found for 2026-08-29, skipping';
    return;
  end if;

  select e.id, e.timestamp
  into v_goal_id, v_goal_ts
  from public.match_events e
  where e.match_id = v_match_id
    and e.event_type = 'opponent_goal'
  order by e.created_at desc
  limit 1;

  if v_goal_id is not null then
    delete from public.match_events
    where match_id = v_match_id
      and event_type = 'shot_away'
      and timestamp = v_goal_ts;

    delete from public.match_events where id = v_goal_id;
  end if;

  update public.matches
  set away_score = 0
  where id = v_match_id;

  raise notice 'U13 Maroon 8-0 fix: updated match %', v_match_id;
end $$;
