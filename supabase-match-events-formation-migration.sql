-- Add formation snapshot to match_events for lineup context at event time

alter table public.match_events
  add column if not exists formation text;

-- Optional: backfill is not required; new events will populate formation going forward.
