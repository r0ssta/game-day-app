-- Soft-archive for teams (never hard-delete). Players already use active_status.
-- Safe to re-run.

alter table public.teams
  add column if not exists active_status boolean not null default true;

create index if not exists idx_teams_active_status
  on public.teams (active_status);

-- Allow reusing a name after a team is archived (active teams stay unique).
alter table public.teams
  drop constraint if exists teams_name_key;

drop index if exists teams_name_active_unique;
create unique index teams_name_active_unique
  on public.teams (lower(name))
  where active_status = true;

-- Block authenticated hard-deletes; archive via UPDATE only.
drop policy if exists "teams_delete_staff" on public.teams;
drop policy if exists "teams_delete_director" on public.teams;

revoke delete on public.teams from authenticated;
revoke delete on public.players from authenticated;

comment on column public.teams.active_status is
  'false = archived; keep row for history/stats, hide from selectors.';

notify pgrst, 'reload schema';
