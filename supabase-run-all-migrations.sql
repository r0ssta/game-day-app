-- Run all pending match schema updates (safe to re-run)

-- Position change notes + event type
alter table public.match_events
  add column if not exists event_notes text;

alter table public.match_events
  drop constraint if exists match_events_event_type_check;

alter table public.match_events
  add constraint match_events_event_type_check
  check (event_type in ('goal', 'assist', 'sub_in', 'sub_out', 'position_change'));

-- Formation snapshot on events
alter table public.match_events
  add column if not exists formation text;

-- Scheduled kickoff date/time on matches
alter table public.matches
  add column if not exists match_date date;

alter table public.matches
  add column if not exists match_time time;
