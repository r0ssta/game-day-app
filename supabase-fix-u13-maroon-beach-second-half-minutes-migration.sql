-- U13 Maroon vs Beach FC N1 (2026-11-21): first-half minutes for non-2nd-half
-- starters were wiped at halftime, and final open second-half stints were wiped
-- at full time when end-regulation cleared subbed_in_at before totals were
-- banked. Rebuild both halves from sub_in / sub_out events.
-- Idempotent: only updates rows whose stored total differs from the rebuild.

do $$
declare
  v_match_id uuid := 'c18a42a0-b350-4f98-8c23-f94bf48bea75';
  v_h1_end integer;
  v_h2_end integer;
  v_h2_start timestamptz;
begin
  if not exists (select 1 from public.matches where id = v_match_id) then
    raise notice 'U13 Maroon Beach minutes fix: match % not found, skipping', v_match_id;
    return;
  end if;

  select min(e.created_at)
  into v_h2_start
  from public.match_events e
  where e.match_id = v_match_id
    and e.event_type = 'sub_in'
    and e.event_notes like 'starting_lineup|%'
    and e.created_at > (
      select min(e2.created_at)
      from public.match_events e2
      where e2.match_id = v_match_id
        and e2.event_type = 'sub_in'
        and e2.event_notes like 'starting_lineup|%'
    );

  if v_h2_start is null then
    raise notice 'U13 Maroon Beach minutes fix: no second-half kickoff found, skipping';
    return;
  end if;

  select coalesce(max(e.timestamp), 0)
  into v_h1_end
  from public.match_events e
  where e.match_id = v_match_id
    and e.event_type = 'sub_out'
    and e.event_notes = 'period_end'
    and e.created_at < v_h2_start;

  select coalesce(max(e.timestamp), 0)
  into v_h2_end
  from public.match_events e
  where e.match_id = v_match_id
    and e.event_type = 'sub_out'
    and e.event_notes = 'period_end'
    and e.created_at >= v_h2_start;

  if v_h1_end <= 0 or v_h2_end <= 0 then
    raise notice 'U13 Maroon Beach minutes fix: missing period_end stamps, skipping';
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
      and e.event_type in ('sub_in', 'sub_out')
  ),
  stints as (
    select
      player_id,
      sum(
        case
          when created_at < v_h2_start
            then greatest(0, coalesce(out_ts, v_h1_end) - timestamp)
          else 0
        end
      )::integer as first_half_seconds,
      sum(
        case
          when created_at >= v_h2_start
            then greatest(0, coalesce(out_ts, v_h2_end) - timestamp)
          else 0
        end
      )::integer as second_half_seconds
    from (
      select
        i.player_id,
        i.timestamp,
        i.created_at,
        o.timestamp as out_ts
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
    total_seconds_played = s.first_half_seconds + s.second_half_seconds,
    total_minutes = (s.first_half_seconds + s.second_half_seconds) / 60.0
  from stints s
  where ms.match_id = v_match_id
    and ms.player_id = s.player_id
    and ms.total_seconds_played is distinct from (s.first_half_seconds + s.second_half_seconds);

  raise notice 'U13 Maroon Beach minutes fix: rebuilt totals for match %', v_match_id;
end $$;
