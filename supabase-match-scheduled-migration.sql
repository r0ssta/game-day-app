-- Allow pre-game schedule imports (e.g. Sprocket ICS) without starting a live match
alter table public.matches
  drop constraint if exists matches_status_check;

alter table public.matches
  add constraint matches_status_check
  check (status in ('active', 'scheduled', 'pending_review', 'completed'));
