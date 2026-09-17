-- Platform / system admins can operate any club without a club_memberships row.
-- Lets a super-admin open a sandbox they created the same way they switch teams.

create or replace function private.is_director_of_club(p_club_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    p_club_id is not null
    and (
      private.is_platform_admin()
      or private.is_system_admin()
      or exists (
        select 1
        from public.club_memberships cm
        where cm.user_id = (select auth.uid())
          and cm.club_id = p_club_id
          and cm.app_role = 'director'
      )
    );
$$;

create or replace function private.is_staff_of_club(p_club_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    p_club_id is not null
    and (
      private.is_platform_admin()
      or private.is_system_admin()
      or exists (
        select 1
        from public.club_memberships cm
        where cm.user_id = (select auth.uid())
          and cm.club_id = p_club_id
          and cm.app_role in ('director', 'coach')
      )
    );
$$;

notify pgrst, 'reload schema';
