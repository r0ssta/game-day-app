-- Absolute period clock so a backgrounded PWA can snap back to wall time.
-- elapsed = accumulated_seconds_before_pause + (now() - period_start_time)

alter table public.matches
  add column if not exists period_start_time timestamptz;

alter table public.matches
  add column if not exists accumulated_seconds_before_pause integer not null default 0
    check (accumulated_seconds_before_pause >= 0);

comment on column public.matches.period_start_time is
  'Whistle / last resume timestamp for the active period. Null when the clock is stopped.';

comment on column public.matches.accumulated_seconds_before_pause is
  'Elapsed seconds banked before the last pause. Added to now() - period_start_time when running.';
