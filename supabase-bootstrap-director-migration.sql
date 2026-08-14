-- First authenticated user becomes Director when none exists yet.
-- Fixes the chicken-and-egg where everyone starts pending and nobody can
-- open Club Admin to assign teams.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role public.staff_role;
  v_display_name text;
begin
  v_display_name := nullif(trim(coalesce(new.raw_user_meta_data ->> 'display_name', '')), '');

  insert into public.profiles (id, email, display_name)
  values (new.id, new.email, v_display_name)
  on conflict (id) do update
    set email = excluded.email,
        updated_at = now();

  if exists (
    select 1
    from public.user_roles ur
    where ur.role = 'director'
  ) then
    v_role := 'pending';
  else
    v_role := 'director';
  end if;

  insert into public.user_roles (user_id, role, display_name)
  values (new.id, v_role, v_display_name)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

-- Promote the earliest pending/staff user if the club still has no director
-- (covers accounts created before this bootstrap rule).
with first_user as (
  select ur.user_id
  from public.user_roles ur
  order by ur.created_at asc, ur.user_id asc
  limit 1
)
update public.user_roles ur
set
  role = 'director',
  updated_at = now()
from first_user
where ur.user_id = first_user.user_id
  and not exists (
    select 1 from public.user_roles d where d.role = 'director'
  );

-- Callable after login as a safety net for already-open sessions
create or replace function public.claim_bootstrap_director()
returns public.staff_role
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := (select auth.uid());
  v_role public.staff_role;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  if exists (select 1 from public.user_roles where role = 'director') then
    select role into v_role from public.user_roles where user_id = v_uid;
    return v_role;
  end if;

  insert into public.user_roles (user_id, role)
  values (v_uid, 'director')
  on conflict (user_id) do update
    set role = 'director',
        updated_at = now();

  select role into v_role from public.user_roles where user_id = v_uid;
  return v_role;
end;
$$;

revoke all on function public.claim_bootstrap_director() from public;
grant execute on function public.claim_bootstrap_director() to authenticated;

notify pgrst, 'reload schema';
