-- Permanently delete a staff user (auth account + related rows).
-- Directors only. Cascades profiles / user_roles / team_members via auth.users FK.
-- Safe to re-run (create or replace).

create or replace function public.delete_staff_user(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_is_director boolean := false;
  v_director_count integer := 0;
begin
  if not private.is_director() then
    raise exception 'Only directors can delete staff';
  end if;

  if p_user_id is null then
    raise exception 'User id is required';
  end if;

  if p_user_id = auth.uid() then
    raise exception 'You cannot delete your own account';
  end if;

  if not exists (select 1 from auth.users where id = p_user_id) then
    raise exception 'Staff user not found';
  end if;

  select exists (
    select 1
    from public.user_roles
    where user_id = p_user_id
      and app_role = 'director'
  )
  into v_is_director;

  if v_is_director then
    select count(*)::integer
    into v_director_count
    from public.user_roles
    where app_role = 'director';

    if v_director_count <= 1 then
      raise exception 'Cannot delete the last director';
    end if;
  end if;

  select lower(email)
  into v_email
  from auth.users
  where id = p_user_id;

  if v_email is not null then
    update public.staff_invites
    set status = 'cancelled'
    where status = 'pending'
      and lower(email) = v_email;
  end if;

  -- Cascades public.profiles, public.user_roles, public.team_members.
  delete from auth.users
  where id = p_user_id;
end;
$$;

revoke all on function public.delete_staff_user(uuid) from public;
grant execute on function public.delete_staff_user(uuid) to authenticated;

comment on function public.delete_staff_user(uuid) is
  'Director-only hard delete of a staff auth user (and cascaded club membership rows).';
