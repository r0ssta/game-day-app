-- Director-only rename of a staff member's display name (profiles + user_roles).
-- Safe to re-run.

create or replace function public.update_staff_display_name(
  p_user_id uuid,
  p_display_name text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := nullif(trim(coalesce(p_display_name, '')), '');
begin
  if not private.is_director() then
    raise exception 'Only directors can rename staff';
  end if;

  if p_user_id is null then
    raise exception 'User id is required';
  end if;

  if v_name is null then
    raise exception 'Display name is required';
  end if;

  if not exists (select 1 from auth.users where id = p_user_id) then
    raise exception 'Staff user not found';
  end if;

  update public.profiles
  set
    display_name = v_name,
    updated_at = now()
  where id = p_user_id;

  update public.user_roles
  set
    display_name = v_name,
    updated_at = now()
  where user_id = p_user_id;
end;
$$;

revoke all on function public.update_staff_display_name(uuid, text) from public;
grant execute on function public.update_staff_display_name(uuid, text) to authenticated;

comment on function public.update_staff_display_name(uuid, text) is
  'Director-only update of a staff member display name on profiles and user_roles.';
