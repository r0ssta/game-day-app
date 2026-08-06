-- Add scheduled game date and kickoff time to matches

alter table public.matches
  add column if not exists match_date date;

alter table public.matches
  add column if not exists match_time time;
