-- Position notes + position_change / formation_change support on match_events
-- Run in Supabase SQL Editor (safe to re-run).

alter table public.match_events
  add column if not exists event_notes text;

alter table public.match_events
  add column if not exists formation text;

alter table public.match_events
  drop constraint if exists match_events_event_type_check;

alter table public.match_events
  add constraint match_events_event_type_check
  check (event_type in (
    'goal',
    'assist',
    'sub_in',
    'sub_out',
    'position_change',
    'opponent_goal',
    'formation_change'
  ));
