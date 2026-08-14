-- Allow directors to delete teams that still have match history.
-- Match child rows already cascade from matches.

alter table public.matches
  drop constraint if exists matches_team_id_fkey;

alter table public.matches
  add constraint matches_team_id_fkey
  foreign key (team_id) references public.teams (id) on delete cascade;

-- Ensure delete remains director-only
drop policy if exists "teams_delete_staff" on public.teams;
drop policy if exists "teams_delete_director" on public.teams;
create policy "teams_delete_director"
  on public.teams for delete to authenticated
  using ((select private.is_director()));

notify pgrst, 'reload schema';
