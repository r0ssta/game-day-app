-- Director staff invites: pre-assign role + teams, apply on magic-link signup

create table if not exists public.staff_invites (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  display_name text,
  role public.staff_role not null,
  team_ids uuid[] not null default '{}',
  invited_by uuid references auth.users (id) on delete set null,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'cancelled')),
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  accepted_user_id uuid references auth.users (id) on delete set null,
  constraint staff_invites_role_check check (
    role in ('director', 'head_coach', 'assistant_coach')
  )
);

create unique index if not exists idx_staff_invites_pending_email
  on public.staff_invites (lower(email))
  where status = 'pending';

create index if not exists idx_staff_invites_email on public.staff_invites (lower(email));
create index if not exists idx_staff_invites_status on public.staff_invites (status);

alter table public.staff_invites enable row level security;

revoke all on public.staff_invites from anon, authenticated;
grant select, insert, update on public.staff_invites to authenticated;

drop policy if exists "staff_invites_select_director" on public.staff_invites;
drop policy if exists "staff_invites_insert_director" on public.staff_invites;
drop policy if exists "staff_invites_update_director" on public.staff_invites;

create policy "staff_invites_select_director"
  on public.staff_invites for select to authenticated
  using ((select private.is_director()));

create policy "staff_invites_insert_director"
  on public.staff_invites for insert to authenticated
  with check ((select private.is_director()));

create policy "staff_invites_update_director"
  on public.staff_invites for update to authenticated
  using ((select private.is_director()))
  with check ((select private.is_director()));

-- Apply role + team memberships for a user (internal helper)
create or replace function private.apply_staff_access(
  p_user_id uuid,
  p_role public.staff_role,
  p_team_ids uuid[],
  p_display_name text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_team_id uuid;
  v_member_role public.staff_role;
begin
  if p_role not in ('director', 'head_coach', 'assistant_coach') then
    raise exception 'Invalid staff role';
  end if;

  insert into public.user_roles (user_id, role, display_name)
  values (p_user_id, p_role, nullif(trim(coalesce(p_display_name, '')), ''))
  on conflict (user_id) do update
    set role = excluded.role,
        display_name = coalesce(excluded.display_name, public.user_roles.display_name),
        updated_at = now();

  update public.profiles
  set
    display_name = coalesce(nullif(trim(coalesce(p_display_name, '')), ''), display_name),
    updated_at = now()
  where id = p_user_id;

  delete from public.team_members where user_id = p_user_id;

  v_member_role := case
    when p_role = 'director' then 'head_coach'::public.staff_role
    else p_role
  end;

  if p_team_ids is not null then
    foreach v_team_id in array p_team_ids
    loop
      if exists (select 1 from public.teams t where t.id = v_team_id) then
        insert into public.team_members (user_id, team_id, role)
        values (p_user_id, v_team_id, v_member_role)
        on conflict (user_id, team_id) do update
          set role = excluded.role;
      end if;
    end loop;
  end if;
end;
$$;

revoke all on function private.apply_staff_access(uuid, public.staff_role, uuid[], text) from public;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role public.staff_role;
  v_display_name text;
  v_invite public.staff_invites%rowtype;
begin
  v_display_name := nullif(trim(coalesce(new.raw_user_meta_data ->> 'display_name', '')), '');

  insert into public.profiles (id, email, display_name)
  values (new.id, new.email, v_display_name)
  on conflict (id) do update
    set email = excluded.email,
        display_name = coalesce(excluded.display_name, public.profiles.display_name),
        updated_at = now();

  select *
  into v_invite
  from public.staff_invites si
  where si.status = 'pending'
    and lower(si.email) = lower(coalesce(new.email, ''))
  order by si.created_at desc
  limit 1;

  if found then
    v_display_name := coalesce(v_invite.display_name, v_display_name);
    perform private.apply_staff_access(
      new.id,
      v_invite.role,
      v_invite.team_ids,
      v_display_name
    );

    update public.staff_invites
    set
      status = 'accepted',
      accepted_at = now(),
      accepted_user_id = new.id
    where id = v_invite.id;

    return new;
  end if;

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

-- Director creates/updates an invite. If that email already has an account,
-- apply access immediately. Client should also send a magic-link email.
create or replace function public.create_staff_invite(
  p_email text,
  p_role public.staff_role,
  p_team_ids uuid[] default '{}',
  p_display_name text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  v_display text := nullif(trim(coalesce(p_display_name, '')), '');
  v_team_ids uuid[] := coalesce(p_team_ids, '{}');
  v_existing_user_id uuid;
  v_invite_id uuid;
begin
  if not private.is_director() then
    raise exception 'Only directors can invite staff';
  end if;

  if v_email is null or v_email = '' or position('@' in v_email) = 0 then
    raise exception 'A valid email is required';
  end if;

  if p_role not in ('director', 'head_coach', 'assistant_coach') then
    raise exception 'Role must be director, head_coach, or assistant_coach';
  end if;

  -- Cancel prior pending invites for this email, then insert fresh
  update public.staff_invites
  set status = 'cancelled'
  where status = 'pending'
    and lower(email) = v_email;

  insert into public.staff_invites (
    email,
    display_name,
    role,
    team_ids,
    invited_by,
    status
  )
  values (
    v_email,
    v_display,
    p_role,
    v_team_ids,
    (select auth.uid()),
    'pending'
  )
  returning id into v_invite_id;

  select u.id
  into v_existing_user_id
  from auth.users u
  where lower(u.email) = v_email
  limit 1;

  if v_existing_user_id is not null then
    perform private.apply_staff_access(
      v_existing_user_id,
      p_role,
      v_team_ids,
      v_display
    );

    update public.staff_invites
    set
      status = 'accepted',
      accepted_at = now(),
      accepted_user_id = v_existing_user_id
    where id = v_invite_id;

    return jsonb_build_object(
      'status', 'updated_existing',
      'invite_id', v_invite_id,
      'user_id', v_existing_user_id,
      'email', v_email
    );
  end if;

  return jsonb_build_object(
    'status', 'invited',
    'invite_id', v_invite_id,
    'email', v_email
  );
end;
$$;

revoke all on function public.create_staff_invite(text, public.staff_role, uuid[], text) from public;
grant execute on function public.create_staff_invite(text, public.staff_role, uuid[], text) to authenticated;

create or replace function public.cancel_staff_invite(p_invite_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not private.is_director() then
    raise exception 'Only directors can cancel invites';
  end if;

  update public.staff_invites
  set status = 'cancelled'
  where id = p_invite_id
    and status = 'pending';
end;
$$;

revoke all on function public.cancel_staff_invite(uuid) from public;
grant execute on function public.cancel_staff_invite(uuid) to authenticated;

notify pgrst, 'reload schema';
