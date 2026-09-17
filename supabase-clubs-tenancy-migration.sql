-- Multi-club tenancy: clubs, memberships, platform admins, club_id on tenant roots.
-- Backfills the existing database as Virginia Velocity. Safe to re-run.

create table if not exists public.clubs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null,
  created_at timestamptz not null default now()
);

create unique index if not exists clubs_slug_unique
  on public.clubs (lower(slug));

create table if not exists public.club_memberships (
  user_id uuid not null references auth.users (id) on delete cascade,
  club_id uuid not null references public.clubs (id) on delete restrict,
  app_role public.app_role not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, club_id)
);

create index if not exists idx_club_memberships_club_id
  on public.club_memberships (club_id);

create index if not exists idx_club_memberships_user_role
  on public.club_memberships (user_id, app_role);

create table if not exists public.platform_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.clubs enable row level security;
alter table public.club_memberships enable row level security;
alter table public.platform_admins enable row level security;

revoke all on public.clubs from anon, authenticated;
revoke all on public.club_memberships from anon, authenticated;
revoke all on public.platform_admins from anon, authenticated;

grant select, update on public.clubs to authenticated;
grant select, insert, update, delete on public.club_memberships to authenticated;
grant select on public.platform_admins to authenticated;

-- ---------------------------------------------------------------------------
-- Seed Virginia Velocity and attach existing rows
-- ---------------------------------------------------------------------------

insert into public.clubs (name, slug)
select 'Virginia Velocity', 'virginia-velocity'
where not exists (
  select 1 from public.clubs where lower(slug) = 'virginia-velocity'
);

insert into public.club_memberships (user_id, club_id, app_role)
select ur.user_id, c.id, ur.app_role
from public.user_roles ur
cross join public.clubs c
where lower(c.slug) = 'virginia-velocity'
  and ur.app_role in ('director', 'coach', 'pending')
on conflict (user_id, club_id) do nothing;

insert into public.platform_admins (user_id)
select ur.user_id
from public.user_roles ur
where ur.app_role = 'director'
order by ur.created_at asc
limit 1
on conflict (user_id) do nothing;

alter table public.teams
  add column if not exists club_id uuid references public.clubs (id) on delete restrict;

alter table public.seasons
  add column if not exists club_id uuid references public.clubs (id) on delete restrict;

alter table public.players
  add column if not exists club_id uuid references public.clubs (id) on delete restrict;

alter table public.coaches
  add column if not exists club_id uuid references public.clubs (id) on delete restrict;

alter table public.staff_invites
  add column if not exists club_id uuid references public.clubs (id) on delete restrict;

update public.teams t
set club_id = c.id
from public.clubs c
where t.club_id is null
  and lower(c.slug) = 'virginia-velocity';

update public.seasons s
set club_id = c.id
from public.clubs c
where s.club_id is null
  and lower(c.slug) = 'virginia-velocity';

update public.players p
set club_id = c.id
from public.clubs c
where p.club_id is null
  and lower(c.slug) = 'virginia-velocity';

update public.coaches ch
set club_id = c.id
from public.clubs c
where ch.club_id is null
  and lower(c.slug) = 'virginia-velocity';

update public.staff_invites si
set club_id = c.id
from public.clubs c
where si.club_id is null
  and lower(c.slug) = 'virginia-velocity';

alter table public.teams alter column club_id set not null;
alter table public.seasons alter column club_id set not null;
alter table public.players alter column club_id set not null;
alter table public.coaches alter column club_id set not null;
alter table public.staff_invites alter column club_id set not null;

create index if not exists idx_teams_club_id on public.teams (club_id);
create index if not exists idx_seasons_club_id on public.seasons (club_id);
create index if not exists idx_players_club_id on public.players (club_id);
create index if not exists idx_coaches_club_id on public.coaches (club_id);
create index if not exists idx_staff_invites_club_id on public.staff_invites (club_id);

drop index if exists teams_name_active_unique;
create unique index if not exists teams_name_active_per_club
  on public.teams (club_id, lower(name))
  where active_status = true;

drop index if exists seasons_name_unique;
create unique index if not exists seasons_club_name_unique
  on public.seasons (club_id, lower(name));

drop index if exists seasons_one_active;
create unique index if not exists seasons_one_active_per_club
  on public.seasons (club_id)
  where status = 'active';

alter table public.coaches drop constraint if exists coaches_name_key;
drop index if exists coaches_name_key;
create unique index if not exists coaches_club_name_unique
  on public.coaches (club_id, lower(name));

drop index if exists idx_staff_invites_pending_email;
create unique index if not exists idx_staff_invites_pending_club_email
  on public.staff_invites (club_id, lower(email))
  where status = 'pending';

-- ---------------------------------------------------------------------------
-- Freeze club_id after insert
-- ---------------------------------------------------------------------------

create or replace function private.enforce_club_id_immutable()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and new.club_id is distinct from old.club_id then
    raise exception 'club_id cannot be changed'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_teams_club_id_immutable on public.teams;
create trigger trg_teams_club_id_immutable
  before update on public.teams
  for each row
  execute function private.enforce_club_id_immutable();

drop trigger if exists trg_seasons_club_id_immutable on public.seasons;
create trigger trg_seasons_club_id_immutable
  before update on public.seasons
  for each row
  execute function private.enforce_club_id_immutable();

drop trigger if exists trg_players_club_id_immutable on public.players;
create trigger trg_players_club_id_immutable
  before update on public.players
  for each row
  execute function private.enforce_club_id_immutable();

drop trigger if exists trg_coaches_club_id_immutable on public.coaches;
create trigger trg_coaches_club_id_immutable
  before update on public.coaches
  for each row
  execute function private.enforce_club_id_immutable();

drop trigger if exists trg_staff_invites_club_id_immutable on public.staff_invites;
create trigger trg_staff_invites_club_id_immutable
  before update on public.staff_invites
  for each row
  execute function private.enforce_club_id_immutable();

-- ---------------------------------------------------------------------------
-- Club-scoped helpers (replace global director omniscience)
-- ---------------------------------------------------------------------------

create or replace function private.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.platform_admins pa
    where pa.user_id = (select auth.uid())
  );
$$;

create or replace function private.is_director_of_club(p_club_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.club_memberships cm
    where cm.user_id = (select auth.uid())
      and cm.club_id = p_club_id
      and cm.app_role = 'director'
  );
$$;

create or replace function private.is_staff_of_club(p_club_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.club_memberships cm
    where cm.user_id = (select auth.uid())
      and cm.club_id = p_club_id
      and cm.app_role in ('director', 'coach')
  );
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
    from public.club_memberships cm
    where cm.user_id = (select auth.uid())
      and cm.app_role = 'director'
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
    from public.club_memberships cm
    where cm.user_id = (select auth.uid())
      and cm.app_role in ('director', 'coach')
  );
$$;

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

create or replace function private.is_director_of_shared_club(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.club_memberships me
    join public.club_memberships them
      on them.club_id = me.club_id
     and them.user_id = p_user_id
    where me.user_id = (select auth.uid())
      and me.app_role = 'director'
  );
$$;

create or replace function private.sync_user_app_role(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role public.app_role;
  v_display text;
begin
  select case
    when exists (
      select 1 from public.club_memberships cm
      where cm.user_id = p_user_id and cm.app_role = 'director'
    ) then 'director'::public.app_role
    when exists (
      select 1 from public.club_memberships cm
      where cm.user_id = p_user_id and cm.app_role = 'coach'
    ) then 'coach'::public.app_role
    else 'pending'::public.app_role
  end
  into v_role;

  select coalesce(p.display_name, ur.display_name)
  into v_display
  from public.profiles p
  left join public.user_roles ur on ur.user_id = p.id
  where p.id = p_user_id;

  insert into public.user_roles (user_id, app_role, display_name)
  values (p_user_id, v_role, v_display)
  on conflict (user_id) do update
    set app_role = excluded.app_role,
        display_name = coalesce(excluded.display_name, public.user_roles.display_name),
        updated_at = now();
end;
$$;

create or replace function private.has_team_access(p_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.teams t
    where t.id = p_team_id
      and private.is_director_of_club(t.club_id)
  )
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
  select exists (
    select 1
    from public.teams t
    where t.id = p_team_id
      and private.is_director_of_club(t.club_id)
  )
  or exists (
    select 1
    from public.team_members tm
    where tm.user_id = (select auth.uid())
      and tm.team_id = p_team_id
      and tm.team_role = 'head_coach'
  );
$$;

create or replace function private.can_manage_destructive()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select private.is_director();
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

create or replace function private.enforce_team_profile_director()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE'
     and (
       new.name is distinct from old.name
       or new.age_group is distinct from old.age_group
       or new.format is distinct from old.format
     )
     and not private.is_director_of_club(new.club_id) then
    raise exception 'Only club directors can change team name, age group, or format'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function private.is_platform_admin() from public;
revoke all on function private.is_director_of_club(uuid) from public;
revoke all on function private.is_staff_of_club(uuid) from public;
revoke all on function private.is_director() from public;
revoke all on function private.is_staff() from public;
revoke all on function private.current_app_role() from public;
revoke all on function private.is_director_of_shared_club(uuid) from public;
revoke all on function private.sync_user_app_role(uuid) from public;
revoke all on function private.has_team_access(uuid) from public;
revoke all on function private.can_manage_team(uuid) from public;
revoke all on function private.can_manage_destructive() from public;
revoke all on function private.has_match_access(uuid) from public;
revoke all on function private.can_manage_match(uuid) from public;

grant execute on function private.is_platform_admin() to authenticated;
grant execute on function private.is_director_of_club(uuid) to authenticated;
grant execute on function private.is_staff_of_club(uuid) to authenticated;
grant execute on function private.is_director() to authenticated;
grant execute on function private.is_staff() to authenticated;
grant execute on function private.current_app_role() to authenticated;
grant execute on function private.is_director_of_shared_club(uuid) to authenticated;
grant execute on function private.has_team_access(uuid) to authenticated;
grant execute on function private.can_manage_team(uuid) to authenticated;
grant execute on function private.can_manage_destructive() to authenticated;
grant execute on function private.has_match_access(uuid) to authenticated;
grant execute on function private.can_manage_match(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- RLS: clubs / memberships / platform_admins
-- ---------------------------------------------------------------------------

drop policy if exists "clubs_select_member_or_platform" on public.clubs;
drop policy if exists "clubs_update_director_or_platform" on public.clubs;
create policy "clubs_select_member_or_platform"
  on public.clubs for select to authenticated
  using (
    (select private.is_platform_admin())
    or (select private.is_staff_of_club(id))
    or exists (
      select 1
      from public.club_memberships cm
      where cm.club_id = clubs.id
        and cm.user_id = (select auth.uid())
    )
  );

create policy "clubs_update_director_or_platform"
  on public.clubs for update to authenticated
  using (
    (select private.is_platform_admin())
    or (select private.is_director_of_club(id))
  )
  with check (
    (select private.is_platform_admin())
    or (select private.is_director_of_club(id))
  );

drop policy if exists "platform_admins_select_own" on public.platform_admins;
create policy "platform_admins_select_own"
  on public.platform_admins for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "club_memberships_select_own_or_director" on public.club_memberships;
drop policy if exists "club_memberships_insert_director" on public.club_memberships;
drop policy if exists "club_memberships_update_director" on public.club_memberships;
drop policy if exists "club_memberships_delete_director" on public.club_memberships;

create policy "club_memberships_select_own_or_director"
  on public.club_memberships for select to authenticated
  using (
    (select auth.uid()) = user_id
    or (select private.is_director_of_club(club_id))
    or (select private.is_platform_admin())
  );

create policy "club_memberships_insert_director"
  on public.club_memberships for insert to authenticated
  with check (
    (select private.is_director_of_club(club_id))
    or (select private.is_platform_admin())
  );

create policy "club_memberships_update_director"
  on public.club_memberships for update to authenticated
  using (
    (select private.is_director_of_club(club_id))
    or (select private.is_platform_admin())
  )
  with check (
    (select private.is_director_of_club(club_id))
    or (select private.is_platform_admin())
  );

create policy "club_memberships_delete_director"
  on public.club_memberships for delete to authenticated
  using (
    (select private.is_director_of_club(club_id))
    or (select private.is_platform_admin())
  );

-- ---------------------------------------------------------------------------
-- RLS: tenant roots
-- ---------------------------------------------------------------------------

drop policy if exists "teams_insert_staff" on public.teams;
drop policy if exists "teams_insert_director" on public.teams;
create policy "teams_insert_director"
  on public.teams for insert to authenticated
  with check ((select private.is_director_of_club(club_id)));

drop policy if exists "seasons_select_staff" on public.seasons;
drop policy if exists "seasons_insert_director" on public.seasons;
drop policy if exists "seasons_update_director" on public.seasons;

create policy "seasons_select_staff"
  on public.seasons for select to authenticated
  using ((select private.is_staff_of_club(club_id)));

create policy "seasons_insert_director"
  on public.seasons for insert to authenticated
  with check ((select private.is_director_of_club(club_id)));

create policy "seasons_update_director"
  on public.seasons for update to authenticated
  using ((select private.is_director_of_club(club_id)))
  with check ((select private.is_director_of_club(club_id)));

drop policy if exists "players_select_staff" on public.players;
drop policy if exists "players_insert_staff" on public.players;
drop policy if exists "players_update_staff" on public.players;

create policy "players_select_staff"
  on public.players for select to authenticated
  using ((select private.is_staff_of_club(club_id)));

create policy "players_insert_staff"
  on public.players for insert to authenticated
  with check ((select private.is_staff_of_club(club_id)));

create policy "players_update_staff"
  on public.players for update to authenticated
  using ((select private.is_staff_of_club(club_id)))
  with check ((select private.is_staff_of_club(club_id)));

drop policy if exists "coaches_select_staff" on public.coaches;
drop policy if exists "coaches_insert_staff" on public.coaches;
drop policy if exists "coaches_update_staff" on public.coaches;

create policy "coaches_select_staff"
  on public.coaches for select to authenticated
  using ((select private.is_staff_of_club(club_id)));

create policy "coaches_insert_staff"
  on public.coaches for insert to authenticated
  with check ((select private.is_staff_of_club(club_id)));

create policy "coaches_update_staff"
  on public.coaches for update to authenticated
  using ((select private.is_staff_of_club(club_id)))
  with check ((select private.is_staff_of_club(club_id)));

drop policy if exists "staff_invites_select_director" on public.staff_invites;
drop policy if exists "staff_invites_insert_director" on public.staff_invites;
drop policy if exists "staff_invites_update_director" on public.staff_invites;

create policy "staff_invites_select_director"
  on public.staff_invites for select to authenticated
  using (
    (select private.is_director_of_club(club_id))
    or (select private.is_platform_admin())
  );

create policy "staff_invites_insert_director"
  on public.staff_invites for insert to authenticated
  with check (
    (select private.is_director_of_club(club_id))
    or (select private.is_platform_admin())
  );

create policy "staff_invites_update_director"
  on public.staff_invites for update to authenticated
  using (
    (select private.is_director_of_club(club_id))
    or (select private.is_platform_admin())
  )
  with check (
    (select private.is_director_of_club(club_id))
    or (select private.is_platform_admin())
  );

drop policy if exists "web_push_subscriptions_select_staff" on public.web_push_subscriptions;
drop policy if exists "web_push_subscriptions_delete_staff" on public.web_push_subscriptions;

create policy "web_push_subscriptions_select_staff"
  on public.web_push_subscriptions for select to authenticated
  using (
    exists (
      select 1
      from public.teams t
      where t.id = web_push_subscriptions.team_id
        and private.is_staff_of_club(t.club_id)
    )
  );

create policy "web_push_subscriptions_delete_staff"
  on public.web_push_subscriptions for delete to authenticated
  using (
    exists (
      select 1
      from public.teams t
      where t.id = web_push_subscriptions.team_id
        and private.is_staff_of_club(t.club_id)
    )
  );

drop policy if exists "profiles_select_director" on public.profiles;
create policy "profiles_select_director"
  on public.profiles for select to authenticated
  using (
    (select private.is_platform_admin())
    or (select private.is_director_of_shared_club(id))
  );

drop policy if exists "user_roles_select_director" on public.user_roles;
create policy "user_roles_select_director"
  on public.user_roles for select to authenticated
  using (
    (select private.is_platform_admin())
    or (select private.is_director_of_shared_club(user_id))
  );

drop policy if exists "team_members_select_director" on public.team_members;
drop policy if exists "team_members_insert_director" on public.team_members;
drop policy if exists "team_members_update_director" on public.team_members;
drop policy if exists "team_members_delete_director" on public.team_members;

create policy "team_members_select_director"
  on public.team_members for select to authenticated
  using (
    exists (
      select 1
      from public.teams t
      where t.id = team_members.team_id
        and private.is_director_of_club(t.club_id)
    )
  );

create policy "team_members_insert_director"
  on public.team_members for insert to authenticated
  with check (
    exists (
      select 1
      from public.teams t
      where t.id = team_id
        and private.is_director_of_club(t.club_id)
    )
  );

create policy "team_members_update_director"
  on public.team_members for update to authenticated
  using (
    exists (
      select 1
      from public.teams t
      where t.id = team_members.team_id
        and private.is_director_of_club(t.club_id)
    )
  )
  with check (
    exists (
      select 1
      from public.teams t
      where t.id = team_id
        and private.is_director_of_club(t.club_id)
    )
  );

create policy "team_members_delete_director"
  on public.team_members for delete to authenticated
  using (
    exists (
      select 1
      from public.teams t
      where t.id = team_members.team_id
        and private.is_director_of_club(t.club_id)
    )
  );

-- ---------------------------------------------------------------------------
-- apply_staff_access (club-scoped; does not wipe other clubs' team_members)
-- ---------------------------------------------------------------------------

drop function if exists private.apply_staff_access(uuid, public.app_role, uuid[], public.team_role, public.team_role[], text);

create or replace function private.apply_staff_access(
  p_user_id uuid,
  p_club_id uuid,
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
  v_next_role public.app_role := p_app_role;
begin
  if p_club_id is null then
    raise exception 'Club is required';
  end if;

  if p_app_role not in ('director', 'coach') then
    raise exception 'Invalid app role';
  end if;

  if p_default_team_role not in ('head_coach', 'assistant_coach') then
    raise exception 'Invalid team role';
  end if;

  -- Keep director when Club Admin assigns teams with coach (same-club preserve).
  if p_app_role = 'coach' then
    select cm.app_role
    into v_next_role
    from public.club_memberships cm
    where cm.user_id = p_user_id
      and cm.club_id = p_club_id;
    if v_next_role is distinct from 'director' then
      v_next_role := 'coach';
    end if;
  end if;

  insert into public.club_memberships (user_id, club_id, app_role)
  values (p_user_id, p_club_id, v_next_role)
  on conflict (user_id, club_id) do update
    set app_role = v_next_role,
        updated_at = now();

  insert into public.user_roles (user_id, app_role, display_name)
  values (p_user_id, v_next_role, nullif(trim(coalesce(p_display_name, '')), ''))
  on conflict (user_id) do update
    set display_name = coalesce(excluded.display_name, public.user_roles.display_name),
        updated_at = now();

  perform private.sync_user_app_role(p_user_id);

  update public.profiles
  set
    display_name = coalesce(nullif(trim(coalesce(p_display_name, '')), ''), display_name),
    updated_at = now()
  where id = p_user_id;

  delete from public.team_members tm
  using public.teams t
  where tm.user_id = p_user_id
    and tm.team_id = t.id
    and t.club_id = p_club_id;

  if p_team_ids is not null then
    foreach v_team_id in array p_team_ids
    loop
      v_idx := v_idx + 1;
      if v_idx <= coalesce(array_length(v_roles, 1), 0) then
        v_team_role := v_roles[v_idx];
      else
        v_team_role := p_default_team_role;
      end if;

      if exists (
        select 1 from public.teams t
        where t.id = v_team_id
          and t.club_id = p_club_id
      ) then
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
  uuid, uuid, public.app_role, uuid[], public.team_role, public.team_role[], text
) from public;

-- ---------------------------------------------------------------------------
-- handle_new_user / claim_bootstrap_director
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_display_name text;
  v_invite public.staff_invites%rowtype;
  v_club_id uuid;
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
      v_invite.club_id,
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

  if exists (select 1 from public.clubs) then
    insert into public.user_roles (user_id, app_role, display_name)
    values (new.id, 'pending', v_display_name)
    on conflict (user_id) do nothing;
    return new;
  end if;

  insert into public.clubs (name, slug)
  values ('Virginia Velocity', 'virginia-velocity')
  returning id into v_club_id;

  insert into public.club_memberships (user_id, club_id, app_role)
  values (new.id, v_club_id, 'director')
  on conflict (user_id, club_id) do nothing;

  insert into public.platform_admins (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  insert into public.user_roles (user_id, app_role, display_name)
  values (new.id, 'director', v_display_name)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

create or replace function public.claim_bootstrap_director()
returns public.app_role
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := (select auth.uid());
  v_role public.app_role;
  v_club_id uuid;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  if exists (select 1 from public.clubs)
     or exists (
       select 1 from public.club_memberships cm where cm.app_role = 'director'
     ) then
    select ur.app_role into v_role from public.user_roles ur where ur.user_id = v_uid;
    return v_role;
  end if;

  insert into public.clubs (name, slug)
  values ('Virginia Velocity', 'virginia-velocity')
  returning id into v_club_id;

  insert into public.club_memberships (user_id, club_id, app_role)
  values (v_uid, v_club_id, 'director')
  on conflict (user_id, club_id) do update
    set app_role = 'director',
        updated_at = now();

  insert into public.platform_admins (user_id)
  values (v_uid)
  on conflict (user_id) do nothing;

  insert into public.user_roles (user_id, app_role)
  values (v_uid, 'director')
  on conflict (user_id) do update
    set app_role = 'director',
        updated_at = now();

  select ur.app_role into v_role from public.user_roles ur where ur.user_id = v_uid;
  return v_role;
end;
$$;

revoke all on function public.claim_bootstrap_director() from public;
grant execute on function public.claim_bootstrap_director() to authenticated;

-- ---------------------------------------------------------------------------
-- Staff invite / season / staff admin RPCs
-- ---------------------------------------------------------------------------

drop function if exists public.create_staff_invite(text, public.app_role, uuid[], text, public.team_role, public.team_role[]);

create or replace function public.create_staff_invite(
  p_email text,
  p_app_role public.app_role,
  p_team_ids uuid[] default '{}',
  p_display_name text default null,
  p_default_team_role public.team_role default 'assistant_coach',
  p_team_roles public.team_role[] default '{}',
  p_club_id uuid default null
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
  v_club_id uuid := p_club_id;
  v_existing_user_id uuid;
  v_invite_id uuid;
  v_bad_team uuid;
begin
  if v_club_id is null then
    raise exception 'Club is required';
  end if;

  if not (
    private.is_director_of_club(v_club_id)
    or private.is_platform_admin()
  ) then
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

  select t.id
  into v_bad_team
  from public.teams t
  where t.id = any (v_team_ids)
    and t.club_id is distinct from v_club_id
  limit 1;

  if v_bad_team is not null then
    raise exception 'Team assignments must belong to this club';
  end if;

  update public.staff_invites
  set status = 'cancelled'
  where status = 'pending'
    and club_id = v_club_id
    and lower(email) = v_email;

  insert into public.staff_invites (
    email,
    display_name,
    app_role,
    team_ids,
    team_roles,
    default_team_role,
    invited_by,
    status,
    club_id
  )
  values (
    v_email,
    v_display,
    p_app_role,
    v_team_ids,
    v_team_roles,
    v_default,
    (select auth.uid()),
    'pending',
    v_club_id
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
      v_club_id,
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
  text, public.app_role, uuid[], text, public.team_role, public.team_role[], uuid
) from public;
grant execute on function public.create_staff_invite(
  text, public.app_role, uuid[], text, public.team_role, public.team_role[], uuid
) to authenticated;

create or replace function public.cancel_staff_invite(p_invite_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_club_id uuid;
begin
  select club_id into v_club_id
  from public.staff_invites
  where id = p_invite_id;

  if v_club_id is null then
    return;
  end if;

  if not (
    private.is_director_of_club(v_club_id)
    or private.is_platform_admin()
  ) then
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

create or replace function public.set_active_season(p_season_id uuid)
returns public.seasons
language plpgsql
security definer
set search_path = public
as $$
declare
  v_season public.seasons;
  v_club_id uuid;
begin
  select club_id into v_club_id
  from public.seasons
  where id = p_season_id;

  if v_club_id is null then
    raise exception 'Season not found';
  end if;

  if not private.is_director_of_club(v_club_id) then
    raise exception 'Only directors can set the active season'
      using errcode = '42501';
  end if;

  update public.seasons
  set status = 'archived'
  where status = 'active'
    and club_id = v_club_id
    and id is distinct from p_season_id;

  update public.seasons
  set status = 'active'
  where id = p_season_id
  returning * into v_season;

  if v_season.id is null then
    raise exception 'Season not found';
  end if;

  return v_season;
end;
$$;

revoke all on function public.set_active_season(uuid) from public;
grant execute on function public.set_active_season(uuid) to authenticated;

drop function if exists public.delete_staff_user(uuid);

create or replace function public.delete_staff_user(p_user_id uuid, p_club_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_is_director boolean := false;
  v_director_count integer := 0;
  v_other_clubs integer := 0;
  v_club_slug text;
begin
  if p_user_id is null or p_club_id is null then
    raise exception 'User id and club are required';
  end if;

  if not (
    private.is_director_of_club(p_club_id)
    or private.is_platform_admin()
  ) then
    raise exception 'Only directors can delete staff';
  end if;

  if p_user_id = auth.uid() then
    raise exception 'You cannot delete your own account';
  end if;

  if not exists (select 1 from auth.users where id = p_user_id) then
    raise exception 'Staff user not found';
  end if;

  select exists (
    select 1
    from public.club_memberships
    where user_id = p_user_id
      and club_id = p_club_id
      and app_role = 'director'
  )
  into v_is_director;

  if v_is_director then
    select count(*)::integer
    into v_director_count
    from public.club_memberships
    where club_id = p_club_id
      and app_role = 'director';

    select slug into v_club_slug from public.clubs where id = p_club_id;

    if v_director_count <= 1
       and (
         not private.is_platform_admin()
         or lower(coalesce(v_club_slug, '')) = 'virginia-velocity'
       ) then
      raise exception 'Cannot delete the last director';
    end if;
  end if;

  delete from public.team_members tm
  using public.teams t
  where tm.user_id = p_user_id
    and tm.team_id = t.id
    and t.club_id = p_club_id;

  delete from public.club_memberships
  where user_id = p_user_id
    and club_id = p_club_id;

  perform private.sync_user_app_role(p_user_id);

  select count(*)::integer
  into v_other_clubs
  from public.club_memberships
  where user_id = p_user_id
    and app_role in ('director', 'coach');

  if v_other_clubs > 0 then
    return;
  end if;

  select lower(email)
  into v_email
  from auth.users
  where id = p_user_id;

  if v_email is not null then
    update public.staff_invites
    set status = 'cancelled'
    where status = 'pending'
      and club_id = p_club_id
      and lower(email) = v_email;
  end if;

  delete from auth.users
  where id = p_user_id;
end;
$$;

revoke all on function public.delete_staff_user(uuid, uuid) from public;
grant execute on function public.delete_staff_user(uuid, uuid) to authenticated;

comment on function public.delete_staff_user(uuid, uuid) is
  'Remove a staff user from a club. Deletes the auth user only when they have no other club memberships.';

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
  if not (
    private.is_director_of_shared_club(p_user_id)
    or private.is_platform_admin()
  ) then
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

create or replace function public.set_club_member_role(
  p_user_id uuid,
  p_club_id uuid,
  p_app_role public.app_role
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (
    private.is_director_of_club(p_club_id)
    or private.is_platform_admin()
  ) then
    raise exception 'Only directors can change staff roles';
  end if;

  if p_user_id is null or p_club_id is null then
    raise exception 'User id and club are required';
  end if;

  if p_app_role not in ('director', 'coach', 'pending') then
    raise exception 'Invalid app role';
  end if;

  if p_app_role = 'pending' then
    delete from public.team_members tm
    using public.teams t
    where tm.user_id = p_user_id
      and tm.team_id = t.id
      and t.club_id = p_club_id;

    insert into public.club_memberships (user_id, club_id, app_role)
    values (p_user_id, p_club_id, 'pending')
    on conflict (user_id, club_id) do update
      set app_role = 'pending',
          updated_at = now();
  else
    insert into public.club_memberships (user_id, club_id, app_role)
    values (p_user_id, p_club_id, p_app_role)
    on conflict (user_id, club_id) do update
      set app_role = excluded.app_role,
          updated_at = now();
  end if;

  perform private.sync_user_app_role(p_user_id);
end;
$$;

revoke all on function public.set_club_member_role(uuid, uuid, public.app_role) from public;
grant execute on function public.set_club_member_role(uuid, uuid, public.app_role) to authenticated;

create or replace function public.create_club(p_name text, p_slug text default null)
returns public.clubs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := nullif(trim(coalesce(p_name, '')), '');
  v_slug text;
  v_base text;
  v_n int := 0;
  v_club public.clubs;
begin
  if not private.is_platform_admin() then
    raise exception 'Only platform admins can create clubs'
      using errcode = '42501';
  end if;

  if v_name is null then
    raise exception 'Club name is required';
  end if;

  v_base := coalesce(
    nullif(public.slugify_team_name(coalesce(nullif(trim(coalesce(p_slug, '')), ''), v_name)), ''),
    'club'
  );
  v_slug := v_base;

  while exists (select 1 from public.clubs c where lower(c.slug) = lower(v_slug))
  loop
    v_n := v_n + 1;
    v_slug := v_base || '-' || v_n::text;
  end loop;

  insert into public.clubs (name, slug)
  values (v_name, v_slug)
  returning * into v_club;

  return v_club;
end;
$$;

revoke all on function public.create_club(text, text) from public;
grant execute on function public.create_club(text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Close cross-tenant hole: position changes require match access
-- ---------------------------------------------------------------------------

create or replace function public.log_player_position_change(
  p_match_id uuid,
  p_player_id uuid,
  p_timestamp integer,
  p_event_notes text default null,
  p_formation text default null,
  p_window_seconds integer default 20
)
returns table (
  event_id uuid,
  merged boolean,
  previous_event_notes text,
  previous_formation text
)
language plpgsql
volatile
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_window integer;
  v_prev_id uuid;
  v_prev_timestamp integer;
  v_prev_created_at timestamptz;
  v_prev_notes text;
  v_prev_formation text;
  v_from text;
  v_to text;
  v_notes text;
  v_id uuid;
begin
  if not private.has_match_access(p_match_id) then
    raise exception 'Staff access required'
      using errcode = '42501';
  end if;

  if p_match_id is null or p_player_id is null then
    raise exception 'match_id and player_id are required'
      using errcode = '22023';
  end if;

  v_window := greatest(coalesce(p_window_seconds, 20), 1);
  v_to := trim(coalesce(p_event_notes, ''));
  if v_to = '' then
    raise exception 'position is required'
      using errcode = '22023';
  end if;
  if strpos(v_to, '→') > 0 then
    v_to := trim(split_part(v_to, '→', 2));
  elsif strpos(v_to, '->') > 0 then
    v_to := trim(split_part(v_to, '->', 2));
  end if;
  if v_to = '' then
    raise exception 'position is required'
      using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(
    hashtext('pos:' || p_match_id::text),
    hashtext(p_player_id::text)
  );

  select
    e.id,
    e.timestamp,
    e.created_at,
    e.event_notes,
    e.formation
  into
    v_prev_id,
    v_prev_timestamp,
    v_prev_created_at,
    v_prev_notes,
    v_prev_formation
  from public.match_events e
  where e.match_id = p_match_id
    and e.player_id = p_player_id
    and e.event_type = 'position_change'
  order by e.created_at desc, e.timestamp desc
  limit 1;

  if v_prev_id is not null
     and (
       v_prev_created_at >= clock_timestamp() - make_interval(secs => v_window)
       or (
         p_timestamp >= v_prev_timestamp
         and (p_timestamp - v_prev_timestamp) < v_window
       )
     )
  then
    v_from := trim(coalesce(v_prev_notes, ''));
    if strpos(v_from, '→') > 0 then
      v_from := trim(split_part(v_from, '→', 1));
    elsif strpos(v_from, '->') > 0 then
      v_from := trim(split_part(v_from, '->', 1));
    else
      v_from := '';
    end if;

    if v_from <> '' and v_from <> v_to then
      v_notes := v_from || '→' || v_to;
    else
      v_notes := v_to;
    end if;

    update public.match_events
    set
      event_notes = v_notes,
      formation = coalesce(nullif(trim(coalesce(p_formation, '')), ''), formation)
    where public.match_events.id = v_prev_id;

    return query
    select v_prev_id, true, v_prev_notes, v_prev_formation;
    return;
  end if;

  v_notes := trim(coalesce(p_event_notes, v_to));
  if v_notes = '' then
    v_notes := v_to;
  end if;

  insert into public.match_events (
    match_id,
    player_id,
    event_type,
    timestamp,
    event_notes,
    formation,
    is_pk
  ) values (
    p_match_id,
    p_player_id,
    'position_change',
    greatest(p_timestamp, 0),
    v_notes,
    p_formation,
    false
  )
  returning id into v_id;

  return query
  select v_id, false, null::text, null::text;
end;
$$;

revoke all on function public.log_player_position_change(uuid, uuid, integer, text, text, integer) from public;
grant execute on function public.log_player_position_change(uuid, uuid, integer, text, text, integer) to authenticated;

revoke all on function public.handle_new_user() from public;
revoke all on function public.handle_new_user() from anon, authenticated;

notify pgrst, 'reload schema';
