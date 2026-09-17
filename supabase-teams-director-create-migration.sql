-- Directors create teams with INSERT … RETURNING. Postgres also applies SELECT
-- policies to the new row. Do not call has_team_access(id) or subquery
-- team_members from teams RLS — both re-read public.teams and 403 / recurse.
-- Evaluate club_id on the new row; membership uses a definer helper.

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

drop policy if exists "teams_insert_director" on public.teams;
create policy "teams_insert_director"
  on public.teams for insert to authenticated
  with check (
    (select private.is_platform_admin())
    or (select private.is_director_of_club(club_id))
  );

notify pgrst, 'reload schema';
