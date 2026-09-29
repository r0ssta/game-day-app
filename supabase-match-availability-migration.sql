-- Mid-match availability: why a player was marked out (injured or left early).
-- Safe to re-run.

alter table public.match_stats
  add column if not exists absence_reason text;

alter table public.match_stats
  drop constraint if exists match_stats_absence_reason_check;

alter table public.match_stats
  add constraint match_stats_absence_reason_check
  check (
    absence_reason is null
    or absence_reason in ('injured', 'left_early')
  );

comment on column public.match_stats.absence_reason is
  'Set when a player is marked out during a match: injured or left_early. Null when they are available, or out with no reason.';
