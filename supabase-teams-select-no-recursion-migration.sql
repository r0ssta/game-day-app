-- Follow-up: the first teams_director_create policy subqueried team_members,
-- and team_members RLS reads teams — infinite recursion on INSERT.
-- Same end state as supabase-teams-director-create-migration.sql.

create or replace function private.is_team_member(p_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.team_members tm
    where tm.user_id = (select auth.uid())
      and tm.team_id = p_team_id
  );
$$;

revoke all on function private.is_team_member(uuid) from public;
grant execute on function private.is_team_member(uuid) to authenticated;

drop policy if exists "teams_select_staff" on public.teams;
create policy "teams_select_staff"
  on public.teams for select to authenticated
  using (
    (select private.is_platform_admin())
    or (select private.is_director_of_club(club_id))
    or (select private.is_team_member(id))
  );

drop policy if exists "teams_update_staff" on public.teams;
create policy "teams_update_staff"
  on public.teams for update to authenticated
  using (
    (select private.is_platform_admin())
    or (select private.is_director_of_club(club_id))
    or (select private.is_team_member(id))
  )
  with check (
    (select private.is_platform_admin())
    or (select private.is_director_of_club(club_id))
    or (select private.is_team_member(id))
  );

notify pgrst, 'reload schema';
