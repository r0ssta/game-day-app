-- U13 Maroon vs Beach FC N1 (2026-11-21): first-half minutes for players who
-- did not start the second half were wiped to 0 when the whistle clock snapped
-- back to a full half before open stints were banked. Rebuild those totals from
-- first-half sub_in / sub_out events. Idempotent: only repairs rows still at 0.

do $$
declare
  v_match_id uuid := 'c18a42a0-b350-4f98-8c23-f94bf48bea75';
  v_period_end integer;
begin
  if not exists (select 1 from public.matches where id = v_match_id) then
    raise notice 'U13 Maroon Beach minutes fix: match % not found, skipping', v_match_id;
    return;
  end if;

  select coalesce(max(e.timestamp), 0)
  into v_period_end
  from public.match_events e
  where e.match_id = v_match_id
    and e.event_type = 'sub_out'
    and e.event_notes = 'period_end'
    and e.created_at < (
      select min(e2.created_at)
      from public.match_events e2
      where e2.match_id = v_match_id
        and e2.event_type = 'sub_in'
        and e2.event_notes like 'starting_lineup|%'
        and e2.created_at > (
          select min(e3.created_at)
          from public.match_events e3
          where e3.match_id = v_match_id
            and e3.event_type = 'sub_in'
            and e3.event_notes like 'starting_lineup|%'
        )
    );

  if v_period_end <= 0 then
    raise notice 'U13 Maroon Beach minutes fix: no first-half period_end found, skipping';
    return;
  end if;

  with events as (
    select
      e.player_id,
      e.event_type,
      e.timestamp,
      e.created_at,
      e.id,
      row_number() over (order by e.created_at, e.id) as rn
    from public.match_events e
    where e.match_id = v_match_id
      and e.created_at < (
        select min(e2.created_at)
        from public.match_events e2
        where e2.match_id = v_match_id
          and e2.event_type = 'sub_in'
          and e2.event_notes like 'starting_lineup|%'
          and e2.created_at > (
            select min(e3.created_at)
            from public.match_events e3
            where e3.match_id = v_match_id
              and e3.event_type = 'sub_in'
              and e3.event_notes like 'starting_lineup|%'
          )
      )
      and e.event_type in ('sub_in', 'sub_out')
  ),
  stints as (
    select
      player_id,
      sum(seconds)::integer as first_half_seconds
    from (
      select
        i.player_id,
        greatest(0, coalesce(o.timestamp, v_period_end) - i.timestamp) as seconds
      from events i
      left join lateral (
        select e2.timestamp
        from events e2
        where e2.player_id = i.player_id
          and e2.rn > i.rn
          and e2.event_type = 'sub_out'
        order by e2.rn
        limit 1
      ) o on true
      where i.event_type = 'sub_in'
    ) s
    group by player_id
  )
  update public.match_stats ms
  set
    total_seconds_played = s.first_half_seconds,
    total_minutes = s.first_half_seconds / 60.0
  from stints s
  where ms.match_id = v_match_id
    and ms.player_id = s.player_id
    and ms.total_seconds_played = 0
    and s.first_half_seconds > 0;

  raise notice 'U13 Maroon Beach minutes fix: restored first-half totals for match %', v_match_id;
end $$;
