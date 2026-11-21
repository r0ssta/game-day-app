-- Parent Hub: a match opened on the ready screen is still scheduled until Start Half.
-- Status stays `live` in the table so the coach screen is unchanged. The hub
-- functions report `scheduled` while the clock is still the full first half.

create or replace function public.parent_hub_display_status(
  p_status text,
  p_period_clock_started boolean,
  p_current_period integer,
  p_period text,
  p_home_score integer,
  p_away_score integer,
  p_clock_seconds integer,
  p_half_length integer,
  p_period_length integer
) returns text
language sql
immutable
as $$
  select case
    when p_status = 'live'
      and coalesce(p_period_clock_started, false) = false
      and coalesce(p_current_period, 1) <= 1
      and lower(btrim(coalesce(p_period, ''))) in ('', '1st', '1')
      and coalesce(p_home_score, 0) = 0
      and coalesce(p_away_score, 0) = 0
      and greatest(coalesce(p_period_length, 0), coalesce(p_half_length, 0)) > 0
      and coalesce(p_clock_seconds, 0) >= greatest(coalesce(p_period_length, 0), coalesce(p_half_length, 0)) * 60
    then 'scheduled'
    else p_status
  end;
$$;

do $patch$
declare
  fn text;
  src text;
  replaced text;
  display text := 'public.parent_hub_display_status(mt.status, mt.period_clock_started, mt.current_period, mt.period, mt.home_score, mt.away_score, mt.clock_seconds, mt.half_length, mt.period_length) as status';
begin
  foreach fn in array array[
    'get_parent_club_hub',
    'get_parent_club_team',
    'get_parent_hub',
    'get_parent_hub_by_slug'
  ]
  loop
    for src in
      select pg_get_functiondef(p.oid)
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname = fn
    loop
      replaced := regexp_replace(
        src,
        'mt\.opponent,\s+mt\.status,',
        'mt.opponent, ' || display || ',',
        'g'
      );
      if replaced = src then
        raise notice 'parent hub status projection unchanged for %', fn;
      else
        execute replaced;
      end if;
    end loop;
  end loop;
end
$patch$;
