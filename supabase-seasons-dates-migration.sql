-- Season start/end as calendar months (stored as the 1st of each month).
-- Safe to re-run.

alter table public.seasons
  add column if not exists starts_on date;

alter table public.seasons
  add column if not exists ends_on date;

alter table public.seasons
  drop constraint if exists seasons_month_range_check;

alter table public.seasons
  add constraint seasons_month_range_check
  check (
    starts_on is null
    or ends_on is null
    or ends_on >= starts_on
  );

comment on column public.seasons.starts_on is
  'First day of the season start month (YYYY-MM-01).';
comment on column public.seasons.ends_on is
  'First day of the season end month (YYYY-MM-01).';

notify pgrst, 'reload schema';
