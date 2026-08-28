-- Support 2 halves or 3 periods per match.
-- Safe to re-run.

alter table public.matches
  add column if not exists total_periods integer not null default 2;

alter table public.matches
  drop constraint if exists matches_total_periods_check;

alter table public.matches
  add constraint matches_total_periods_check
  check (total_periods in (2, 3));

alter table public.matches
  add column if not exists period_length integer;

update public.matches
set period_length = half_length
where period_length is null;

alter table public.matches
  alter column period_length set default 30;

alter table public.matches
  alter column period_length set not null;

alter table public.matches
  drop constraint if exists matches_period_length_check;

alter table public.matches
  add constraint matches_period_length_check
  check (period_length > 0);

alter table public.matches
  add column if not exists current_period integer;

update public.matches
set current_period = case
  when period = '2nd' then 2
  when period = '3rd' then 3
  else 1
end
where current_period is null;

alter table public.matches
  alter column current_period set default 1;

alter table public.matches
  alter column current_period set not null;

alter table public.matches
  drop constraint if exists matches_current_period_check;

alter table public.matches
  add constraint matches_current_period_check
  check (current_period >= 1 and current_period <= 3);

alter table public.matches
  drop constraint if exists matches_period_check;

alter table public.matches
  add constraint matches_period_check
  check (period in ('1st', '2nd', '3rd'));

comment on column public.matches.total_periods is
  '2 = halves, 3 = periods (e.g. U9/U10 league).';
comment on column public.matches.period_length is
  'Minutes per period/half. Prefer over legacy half_length.';
comment on column public.matches.current_period is
  '1-based index of the active period (1..total_periods).';
