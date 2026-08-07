-- Allow matches to sit in pending_review until post-game recap is finalized
alter table public.matches
  drop constraint if exists matches_status_check;

alter table public.matches
  add constraint matches_status_check
  check (status in ('active', 'pending_review', 'completed'));
