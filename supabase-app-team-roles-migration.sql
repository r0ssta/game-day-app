-- Decouple club-level app roles from per-team coaching roles.
--
-- user_roles.app_role: director | coach | pending  (coach labeled "Staff" in UI)
-- team_members.team_role: head_coach | assistant_coach
--
-- Directors keep app_role = director while holding any team_role on teams.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type where typname = 'app_role') then
    create type public.app_role as enum ('director', 'coach', 'pending');
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'team_role') then
    create type public.team_role as enum ('head_coach', 'assistant_coach');
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- user_roles: add app_role, backfill, drop legacy role
-- ---------------------------------------------------------------------------

alter table public.user_roles
  add column if not exists app_role public.app_role;

update public.user_roles
set app_role = case
  when role::text = 'director' then 'director'::public.app_role
  when role::text = 'pending' then 'pending'::public.app_role
  else 'coach'::public.app_role
end
where app_role is null;

alter table public.user_roles
  alter column app_role set default 'pending'::public.app_role;

alter table public.user_roles
  alter column app_role set not null;

-- ---------------------------------------------------------------------------
-- team_members: add team_role, backfill, drop legacy role
-- ---------------------------------------------------------------------------

alter table public.team_members
  add column if not exists team_role public.team_role;

update public.team_members
set team_role = case
  when role::text = 'assistant_coach' then 'assistant_coach'::public.team_role
  else 'head_coach'::public.team_role
end
where team_role is null;

alter table public.team_members
  alter column team_role set default 'assistant_coach'::public.team_role;

alter table public.team_members
  alter column team_role set not null;

-- ---------------------------------------------------------------------------
-- staff_invites: app_role + default_team_role + parallel team_roles
-- ---------------------------------------------------------------------------

alter table public.staff_invites
  add column if not exists app_role public.app_role;

alter table public.staff_invites
  add column if not exists default_team_role public.team_role;

alter table public.staff_invites
  add column if not exists team_roles public.team_role[];

update public.staff_invites
set
  app_role = case
    when role::text = 'director' then 'director'::public.app_role
    else 'coach'::public.app_role
  end,
  default_team_role = case
    when role::text = 'assistant_coach' then 'assistant_coach'::public.team_role
    else 'head_coach'::public.team_role
  end,
  team_roles = coalesce(team_roles, '{}'::public.team_role[])
where app_role is null;

alter table public.staff_invites
  alter column app_role set not null;

alter table public.staff_invites
  alter column default_team_role set default 'assistant_coach'::public.team_role;

update public.staff_invites
set default_team_role = 'assistant_coach'::public.team_role
where default_team_role is null;

alter table public.staff_invites
  alter column default_team_role set not null;

update public.staff_invites
set team_roles = '{}'::public.team_role[]
where team_roles is null;

alter table public.staff_invites
  alter column team_roles set default '{}'::public.team_role[];

alter table public.staff_invites
  alter column team_roles set not null;

-- Drop policies/functions that depend on legacy columns before dropping them
drop policy if exists "user_roles_update_own_display_name" on public.user_roles;

drop function if exists private.apply_staff_access(uuid, public.staff_role, uuid[], text);
drop function if exists public.create_staff_invite(text, public.staff_role, uuid[], text);
drop function if exists private.current_staff_role();
drop function if exists public.claim_bootstrap_director();

-- Drop legacy columns (functions recreated below)
alter table public.user_roles drop column if exists role;
alter table public.team_members drop column if exists role;

alter table public.staff_invites drop constraint if exists staff_invites_role_check;
alter table public.staff_invites drop column if exists role;

create index if not exists idx_user_roles_app_role on public.user_roles (app_role);

alter table public.team_members
  drop constraint if exists team_members_role_check;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function private.current_app_role()
returns public.app_role
language sql
stable
security definer
set search_path = public
as $$
  select ur.app_role
  from public.user_roles ur
  where ur.user_id = (select auth.uid())
  limit 1;
$$;

create or replace function private.is_director()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles ur
    where ur.user_id = (select auth.uid())
      and ur.app_role = 'director'
  );
$$;

create or replace function private.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles ur
    where ur.user_id = (select auth.uid())
      and ur.app_role in ('director', 'coach')
  );
$$;

-- Global destructive helper: directors only (team deletes, etc.)
create or replace function private.can_manage_destructive()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select private.is_director();
$$;

create or replace function private.has_team_access(p_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    private.is_director()
    or exists (
      select 1
      from public.team_members tm
      where tm.user_id = (select auth.uid())
        and tm.team_id = p_team_id
    );
$$;

create or replace function private.can_manage_team(p_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    private.is_director()
    or exists (
      select 1
      from public.team_members tm
      where tm.user_id = (select auth.uid())
        and tm.team_id = p_team_id
        and tm.team_role = 'head_coach'
    );
$$;

create or replace function private.has_match_access(p_match_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.matches m
    where m.id = p_match_id
      and private.has_team_access(m.team_id)
  );
$$;

create or replace function private.can_manage_match(p_match_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.matches m
    where m.id = p_match_id
      and private.can_manage_team(m.team_id)
  );
$$;

revoke all on function private.current_app_role() from public;
revoke all on function private.is_director() from public;
revoke all on function private.is_staff() from public;
revoke all on function private.can_manage_destructive() from public;
revoke all on function private.has_team_access(uuid) from public;
revoke all on function private.can_manage_team(uuid) from public;
revoke all on function private.has_match_access(uuid) from public;
revoke all on function private.can_manage_match(uuid) from public;

grant execute on function private.current_app_role() to authenticated;
grant execute on function private.is_director() to authenticated;
grant execute on function private.is_staff() to authenticated;
grant execute on function private.can_manage_destructive() to authenticated;
grant execute on function private.has_team_access(uuid) to authenticated;
grant execute on function private.can_manage_team(uuid) to authenticated;
grant execute on function private.has_match_access(uuid) to authenticated;
grant execute on function private.can_manage_match(uuid) to authenticated;

-- Recreate own-display-name policy against app_role
create policy "user_roles_update_own_display_name"
  on public.user_roles for update to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and app_role = (select private.current_app_role())
  );

-- ---------------------------------------------------------------------------
-- Delete policies: team-scoped head coach (or director)
-- ---------------------------------------------------------------------------

drop policy if exists "matches_delete_staff" on public.matches;
create policy "matches_delete_staff"
  on public.matches for delete to authenticated
  using ((select private.can_manage_team(team_id)));

drop policy if exists "match_events_delete_staff" on public.match_events;
create policy "match_events_delete_staff"
  on public.match_events for delete to authenticated
  using ((select private.can_manage_match(match_id)));

drop policy if exists "lineup_presets_delete_staff" on public.lineup_presets;
create policy "lineup_presets_delete_staff"
  on public.lineup_presets for delete to authenticated
  using ((select private.can_manage_team(team_id)));

-- ---------------------------------------------------------------------------
-- apply_staff_access
-- ---------------------------------------------------------------------------

create or replace function private.apply_staff_access(
  p_user_id uuid,
  p_app_role public.app_role,
  p_team_ids uuid[],
  p_default_team_role public.team_role default 'assistant_coach',
  p_team_roles public.team_role[] default '{}',
  p_display_name text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_team_id uuid;
  v_idx int := 0;
  v_team_role public.team_role;
  v_roles public.team_role[] := coalesce(p_team_roles, '{}');
begin
  if p_app_role not in ('director', 'coach') then
    raise exception 'Invalid app role';
  end if;

  if p_default_team_role not in ('head_coach', 'assistant_coach') then
    raise exception 'Invalid team role';
  end if;

  insert into public.user_roles (user_id, app_role, display_name)
  values (p_user_id, p_app_role, nullif(trim(coalesce(p_display_name, '')), ''))
  on conflict (user_id) do update
    set app_role = case
          when public.user_roles.app_role = 'director'::public.app_role
           and excluded.app_role = 'coach'::public.app_role
          then public.user_roles.app_role
          else excluded.app_role
        end,
        display_name = coalesce(excluded.display_name, public.user_roles.display_name),
        updated_at = now();

  update public.profiles
  set
    display_name = coalesce(nullif(trim(coalesce(p_display_name, '')), ''), display_name),
    updated_at = now()
  where id = p_user_id;

  delete from public.team_members where user_id = p_user_id;

  if p_team_ids is not null then
    foreach v_team_id in array p_team_ids
    loop
      v_idx := v_idx + 1;
      if v_idx <= coalesce(array_length(v_roles, 1), 0) then
        v_team_role := v_roles[v_idx];
      else
        v_team_role := p_default_team_role;
      end if;

      if exists (select 1 from public.teams t where t.id = v_team_id) then
        insert into public.team_members (user_id, team_id, team_role)
        values (p_user_id, v_team_id, v_team_role)
        on conflict (user_id, team_id) do update
          set team_role = excluded.team_role;
      end if;
    end loop;
  end if;
end;
$$;

revoke all on function private.apply_staff_access(
  uuid, public.app_role, uuid[], public.team_role, public.team_role[], text
) from public;

-- ---------------------------------------------------------------------------
-- handle_new_user
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_app_role public.app_role;
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
      v_invite.app_role,
      v_invite.team_ids,
      v_invite.default_team_role,
      v_invite.team_roles,
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
    where ur.app_role = 'director'
  ) then
    v_app_role := 'pending';
  else
    v_app_role := 'director';
  end if;

  insert into public.user_roles (user_id, app_role, display_name)
  values (new.id, v_app_role, v_display_name)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- claim_bootstrap_director
-- ---------------------------------------------------------------------------

create or replace function public.claim_bootstrap_director()
returns public.app_role
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := (select auth.uid());
  v_role public.app_role;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  if exists (
    select 1 from public.user_roles ur where ur.app_role = 'director'
  ) then
    select app_role into v_role from public.user_roles where user_id = v_uid;
    return v_role;
  end if;

  insert into public.user_roles (user_id, app_role)
  values (v_uid, 'director')
  on conflict (user_id) do update
    set app_role = 'director',
        updated_at = now();

  select app_role into v_role from public.user_roles where user_id = v_uid;
  return v_role;
end;
$$;

revoke all on function public.claim_bootstrap_director() from public;
grant execute on function public.claim_bootstrap_director() to authenticated;

-- ---------------------------------------------------------------------------
-- create_staff_invite
-- ---------------------------------------------------------------------------

create or replace function public.create_staff_invite(
  p_email text,
  p_app_role public.app_role,
  p_team_ids uuid[] default '{}',
  p_display_name text default null,
  p_default_team_role public.team_role default 'assistant_coach',
  p_team_roles public.team_role[] default '{}'
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
  v_team_roles public.team_role[] := coalesce(p_team_roles, '{}');
  v_default public.team_role := coalesce(p_default_team_role, 'assistant_coach');
  v_existing_user_id uuid;
  v_invite_id uuid;
begin
  if not private.is_director() then
    raise exception 'Only directors can invite staff';
  end if;

  if v_email is null or v_email = '' or position('@' in v_email) = 0 then
    raise exception 'A valid email is required';
  end if;

  if p_app_role not in ('director', 'coach') then
    raise exception 'App role must be director or coach';
  end if;

  if v_default not in ('head_coach', 'assistant_coach') then
    raise exception 'Invalid default team role';
  end if;

  update public.staff_invites
  set status = 'cancelled'
  where status = 'pending'
    and lower(email) = v_email;

  insert into public.staff_invites (
    email,
    display_name,
    app_role,
    team_ids,
    team_roles,
    default_team_role,
    invited_by,
    status
  )
  values (
    v_email,
    v_display,
    p_app_role,
    v_team_ids,
    v_team_roles,
    v_default,
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
      p_app_role,
      v_team_ids,
      v_default,
      v_team_roles,
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

revoke all on function public.create_staff_invite(
  text, public.app_role, uuid[], text, public.team_role, public.team_role[]
) from public;
grant execute on function public.create_staff_invite(
  text, public.app_role, uuid[], text, public.team_role, public.team_role[]
) to authenticated;

notify pgrst, 'reload schema';
