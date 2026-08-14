-- Profiles, team memberships, pending role, and team-scoped RLS (idempotent)
--
-- Requires: supabase-staff-role-pending-enum-migration.sql (pending enum value)
--
-- Bootstrap first Director after you sign in via magic link:
--   update public.user_roles
--   set role = 'director'
--   where user_id = '<auth-user-uuid>';
--
-- Also add http://localhost:5173 (and production URL) under
-- Authentication → URL Configuration → Redirect URLs.

create schema if not exists private;

-- staff_role.pending is added in supabase-staff-role-pending-enum-migration.sql

-- ---------------------------------------------------------------------------
-- Profiles (synced from auth.users)
-- ---------------------------------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_profiles_email on public.profiles (email);

alter table public.profiles enable row level security;

-- Ensure user_roles exists (from prior migration) and default new rows to pending
create table if not exists public.user_roles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role public.staff_role not null default 'pending',
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_roles
  alter column role set default 'pending';

create index if not exists idx_user_roles_user_id on public.user_roles (user_id);
create index if not exists idx_user_roles_role on public.user_roles (role);

alter table public.user_roles enable row level security;

-- ---------------------------------------------------------------------------
-- Team memberships (coach ↔ team)
-- ---------------------------------------------------------------------------

create table if not exists public.team_members (
  user_id uuid not null references auth.users (id) on delete cascade,
  team_id uuid not null references public.teams (id) on delete cascade,
  role public.staff_role not null default 'assistant_coach',
  created_at timestamptz not null default now(),
  primary key (user_id, team_id),
  constraint team_members_role_check check (role <> 'pending'::public.staff_role)
);

create index if not exists idx_team_members_user_id on public.team_members (user_id);
create index if not exists idx_team_members_team_id on public.team_members (team_id);

alter table public.team_members enable row level security;

-- ---------------------------------------------------------------------------
-- Role / access helpers
-- ---------------------------------------------------------------------------

create or replace function private.current_staff_role()
returns public.staff_role
language sql
stable
security definer
set search_path = public
as $$
  select ur.role
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
      and ur.role = 'director'
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
      and ur.role in ('director', 'head_coach', 'assistant_coach')
  );
$$;

create or replace function private.can_manage_destructive()
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
      and ur.role in ('director', 'head_coach')
  );
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

revoke all on function private.current_staff_role() from public;
revoke all on function private.is_director() from public;
revoke all on function private.is_staff() from public;
revoke all on function private.can_manage_destructive() from public;
revoke all on function private.has_team_access(uuid) from public;
revoke all on function private.has_match_access(uuid) from public;

grant execute on function private.current_staff_role() to authenticated;
grant execute on function private.is_director() to authenticated;
grant execute on function private.is_staff() to authenticated;
grant execute on function private.can_manage_destructive() to authenticated;
grant execute on function private.has_team_access(uuid) to authenticated;
grant execute on function private.has_match_access(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Auth signup sync: profile + pending role
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    new.email,
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'display_name', '')), '')
  )
  on conflict (id) do update
    set email = excluded.email,
        updated_at = now();

  insert into public.user_roles (user_id, role, display_name)
  values (
    new.id,
    'pending',
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'display_name', '')), '')
  )
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill profiles + roles for existing auth users
insert into public.profiles (id, email, display_name)
select
  u.id,
  u.email,
  nullif(trim(coalesce(u.raw_user_meta_data ->> 'display_name', '')), '')
from auth.users u
on conflict (id) do update
  set email = excluded.email,
      updated_at = now();

insert into public.user_roles (user_id, role, display_name)
select
  u.id,
  'pending',
  nullif(trim(coalesce(u.raw_user_meta_data ->> 'display_name', '')), '')
from auth.users u
on conflict (user_id) do nothing;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

revoke all on public.profiles from anon, authenticated;
grant select, update on public.profiles to authenticated;

revoke all on public.user_roles from anon, authenticated;
grant select, update on public.user_roles to authenticated;

revoke all on public.team_members from anon, authenticated;
grant select, insert, update, delete on public.team_members to authenticated;

-- ---------------------------------------------------------------------------
-- Profiles / roles / memberships policies
-- ---------------------------------------------------------------------------

drop policy if exists "profiles_select_own" on public.profiles;
drop policy if exists "profiles_select_director" on public.profiles;
drop policy if exists "profiles_update_own" on public.profiles;

create policy "profiles_select_own"
  on public.profiles for select to authenticated
  using ((select auth.uid()) = id);

create policy "profiles_select_director"
  on public.profiles for select to authenticated
  using ((select private.is_director()));

create policy "profiles_update_own"
  on public.profiles for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

drop policy if exists "user_roles_select_own" on public.user_roles;
drop policy if exists "user_roles_select_director" on public.user_roles;
drop policy if exists "user_roles_update_own_display_name" on public.user_roles;
drop policy if exists "user_roles_update_director" on public.user_roles;

create policy "user_roles_select_own"
  on public.user_roles for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "user_roles_select_director"
  on public.user_roles for select to authenticated
  using ((select private.is_director()));

create policy "user_roles_update_own_display_name"
  on public.user_roles for update to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and role = (select private.current_staff_role())
  );

create policy "user_roles_update_director"
  on public.user_roles for update to authenticated
  using ((select private.is_director()))
  with check ((select private.is_director()));

drop policy if exists "team_members_select_own" on public.team_members;
drop policy if exists "team_members_select_director" on public.team_members;
drop policy if exists "team_members_insert_director" on public.team_members;
drop policy if exists "team_members_update_director" on public.team_members;
drop policy if exists "team_members_delete_director" on public.team_members;

create policy "team_members_select_own"
  on public.team_members for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "team_members_select_director"
  on public.team_members for select to authenticated
  using ((select private.is_director()));

create policy "team_members_insert_director"
  on public.team_members for insert to authenticated
  with check ((select private.is_director()));

create policy "team_members_update_director"
  on public.team_members for update to authenticated
  using ((select private.is_director()))
  with check ((select private.is_director()));

create policy "team_members_delete_director"
  on public.team_members for delete to authenticated
  using ((select private.is_director()));

-- ---------------------------------------------------------------------------
-- Replace staff policies with team-scoped access
-- ---------------------------------------------------------------------------

-- TEAMS
drop policy if exists "teams_select_all" on public.teams;
drop policy if exists "teams_insert_all" on public.teams;
drop policy if exists "teams_update_all" on public.teams;
drop policy if exists "teams_delete_staff" on public.teams;
drop policy if exists "teams_select_staff" on public.teams;
drop policy if exists "teams_insert_staff" on public.teams;
drop policy if exists "teams_update_staff" on public.teams;
drop policy if exists "teams_select_stat_tracker" on public.teams;

create policy "teams_select_staff"
  on public.teams for select to authenticated
  using ((select private.is_staff()) and (select private.has_team_access(id)));

create policy "teams_insert_staff"
  on public.teams for insert to authenticated
  with check ((select private.is_director()));

create policy "teams_update_staff"
  on public.teams for update to authenticated
  using ((select private.is_staff()) and (select private.has_team_access(id)))
  with check ((select private.is_staff()) and (select private.has_team_access(id)));

create policy "teams_delete_staff"
  on public.teams for delete to authenticated
  using ((select private.is_director()));

create policy "teams_select_stat_tracker"
  on public.teams for select to anon
  using (
    exists (
      select 1
      from public.matches m
      join public.match_stat_trackers t on t.match_id = m.id
      where m.team_id = teams.id
        and t.revoked_at is null
    )
  );

-- MATCHES
drop policy if exists "matches_select_all" on public.matches;
drop policy if exists "matches_insert_all" on public.matches;
drop policy if exists "matches_update_all" on public.matches;
drop policy if exists "matches_delete_all" on public.matches;
drop policy if exists "matches_select_staff" on public.matches;
drop policy if exists "matches_insert_staff" on public.matches;
drop policy if exists "matches_update_staff" on public.matches;
drop policy if exists "matches_delete_staff" on public.matches;
drop policy if exists "matches_select_stat_tracker" on public.matches;

create policy "matches_select_staff"
  on public.matches for select to authenticated
  using ((select private.is_staff()) and (select private.has_team_access(team_id)));

create policy "matches_insert_staff"
  on public.matches for insert to authenticated
  with check ((select private.is_staff()) and (select private.has_team_access(team_id)));

create policy "matches_update_staff"
  on public.matches for update to authenticated
  using ((select private.is_staff()) and (select private.has_team_access(team_id)))
  with check ((select private.is_staff()) and (select private.has_team_access(team_id)));

create policy "matches_delete_staff"
  on public.matches for delete to authenticated
  using (
    (select private.can_manage_destructive())
    and (select private.has_team_access(team_id))
  );

create policy "matches_select_stat_tracker"
  on public.matches for select to anon
  using (
    exists (
      select 1
      from public.match_stat_trackers t
      where t.match_id = matches.id
        and t.revoked_at is null
    )
  );

-- MATCH EVENTS
drop policy if exists "match_events_select_all" on public.match_events;
drop policy if exists "match_events_insert_all" on public.match_events;
drop policy if exists "match_events_delete_all" on public.match_events;
drop policy if exists "match_events_select_staff" on public.match_events;
drop policy if exists "match_events_insert_staff" on public.match_events;
drop policy if exists "match_events_delete_staff" on public.match_events;
drop policy if exists "match_events_select_stat_tracker" on public.match_events;

create policy "match_events_select_staff"
  on public.match_events for select to authenticated
  using ((select private.is_staff()) and (select private.has_match_access(match_id)));

create policy "match_events_insert_staff"
  on public.match_events for insert to authenticated
  with check ((select private.is_staff()) and (select private.has_match_access(match_id)));

create policy "match_events_delete_staff"
  on public.match_events for delete to authenticated
  using (
    (select private.can_manage_destructive())
    and (select private.has_match_access(match_id))
  );

create policy "match_events_select_stat_tracker"
  on public.match_events for select to anon
  using (
    exists (
      select 1
      from public.match_stat_trackers t
      where t.match_id = match_events.match_id
        and t.revoked_at is null
    )
  );

-- PLAYERS
drop policy if exists "players_select_all" on public.players;
drop policy if exists "players_insert_all" on public.players;
drop policy if exists "players_update_all" on public.players;
drop policy if exists "players_select_staff" on public.players;
drop policy if exists "players_insert_staff" on public.players;
drop policy if exists "players_update_staff" on public.players;
drop policy if exists "players_select_stat_tracker" on public.players;

create policy "players_select_staff"
  on public.players for select to authenticated
  using ((select private.is_staff()) and (select private.has_team_access(team_id)));

create policy "players_insert_staff"
  on public.players for insert to authenticated
  with check ((select private.is_staff()) and (select private.has_team_access(team_id)));

create policy "players_update_staff"
  on public.players for update to authenticated
  using ((select private.is_staff()) and (select private.has_team_access(team_id)))
  with check ((select private.is_staff()) and (select private.has_team_access(team_id)));

create policy "players_select_stat_tracker"
  on public.players for select to anon
  using (
    exists (
      select 1
      from public.matches m
      join public.match_stat_trackers t on t.match_id = m.id
      where m.team_id = players.team_id
        and t.revoked_at is null
    )
  );

-- MATCH STATS
drop policy if exists "match_stats_select_all" on public.match_stats;
drop policy if exists "match_stats_insert_all" on public.match_stats;
drop policy if exists "match_stats_update_all" on public.match_stats;
drop policy if exists "match_stats_select_staff" on public.match_stats;
drop policy if exists "match_stats_insert_staff" on public.match_stats;
drop policy if exists "match_stats_update_staff" on public.match_stats;
drop policy if exists "match_stats_select_stat_tracker" on public.match_stats;

create policy "match_stats_select_staff"
  on public.match_stats for select to authenticated
  using ((select private.is_staff()) and (select private.has_match_access(match_id)));

create policy "match_stats_insert_staff"
  on public.match_stats for insert to authenticated
  with check ((select private.is_staff()) and (select private.has_match_access(match_id)));

create policy "match_stats_update_staff"
  on public.match_stats for update to authenticated
  using ((select private.is_staff()) and (select private.has_match_access(match_id)))
  with check ((select private.is_staff()) and (select private.has_match_access(match_id)));

create policy "match_stats_select_stat_tracker"
  on public.match_stats for select to anon
  using (
    exists (
      select 1
      from public.match_stat_trackers t
      where t.match_id = match_stats.match_id
        and t.revoked_at is null
    )
  );

-- MATCH REVIEWS
drop policy if exists "match_reviews_select_all" on public.match_reviews;
drop policy if exists "match_reviews_insert_all" on public.match_reviews;
drop policy if exists "match_reviews_update_all" on public.match_reviews;
drop policy if exists "match_reviews_select_staff" on public.match_reviews;
drop policy if exists "match_reviews_insert_staff" on public.match_reviews;
drop policy if exists "match_reviews_update_staff" on public.match_reviews;

create policy "match_reviews_select_staff"
  on public.match_reviews for select to authenticated
  using ((select private.is_staff()) and (select private.has_match_access(match_id)));

create policy "match_reviews_insert_staff"
  on public.match_reviews for insert to authenticated
  with check ((select private.is_staff()) and (select private.has_match_access(match_id)));

create policy "match_reviews_update_staff"
  on public.match_reviews for update to authenticated
  using ((select private.is_staff()) and (select private.has_match_access(match_id)))
  with check ((select private.is_staff()) and (select private.has_match_access(match_id)));

-- LINEUP PRESETS
drop policy if exists "lineup_presets_select_all" on public.lineup_presets;
drop policy if exists "lineup_presets_insert_all" on public.lineup_presets;
drop policy if exists "lineup_presets_update_all" on public.lineup_presets;
drop policy if exists "lineup_presets_delete_all" on public.lineup_presets;
drop policy if exists "lineup_presets_select_staff" on public.lineup_presets;
drop policy if exists "lineup_presets_insert_staff" on public.lineup_presets;
drop policy if exists "lineup_presets_update_staff" on public.lineup_presets;
drop policy if exists "lineup_presets_delete_staff" on public.lineup_presets;

create policy "lineup_presets_select_staff"
  on public.lineup_presets for select to authenticated
  using ((select private.is_staff()) and (select private.has_team_access(team_id)));

create policy "lineup_presets_insert_staff"
  on public.lineup_presets for insert to authenticated
  with check ((select private.is_staff()) and (select private.has_team_access(team_id)));

create policy "lineup_presets_update_staff"
  on public.lineup_presets for update to authenticated
  using ((select private.is_staff()) and (select private.has_team_access(team_id)))
  with check ((select private.is_staff()) and (select private.has_team_access(team_id)));

create policy "lineup_presets_delete_staff"
  on public.lineup_presets for delete to authenticated
  using (
    (select private.can_manage_destructive())
    and (select private.has_team_access(team_id))
  );

-- COACHES (club-wide directory for active staff)
drop policy if exists "coaches_select_all" on public.coaches;
drop policy if exists "coaches_insert_all" on public.coaches;
drop policy if exists "coaches_update_all" on public.coaches;
drop policy if exists "coaches_select_staff" on public.coaches;
drop policy if exists "coaches_insert_staff" on public.coaches;
drop policy if exists "coaches_update_staff" on public.coaches;

create policy "coaches_select_staff"
  on public.coaches for select to authenticated
  using ((select private.is_staff()));

create policy "coaches_insert_staff"
  on public.coaches for insert to authenticated
  with check ((select private.is_staff()));

create policy "coaches_update_staff"
  on public.coaches for update to authenticated
  using ((select private.is_staff()))
  with check ((select private.is_staff()));

-- MATCH STAT TRACKERS
drop policy if exists "match_stat_trackers_select_all" on public.match_stat_trackers;
drop policy if exists "match_stat_trackers_insert_all" on public.match_stat_trackers;
drop policy if exists "match_stat_trackers_update_all" on public.match_stat_trackers;
drop policy if exists "match_stat_trackers_select_staff" on public.match_stat_trackers;
drop policy if exists "match_stat_trackers_insert_staff" on public.match_stat_trackers;
drop policy if exists "match_stat_trackers_update_staff" on public.match_stat_trackers;
drop policy if exists "match_stat_trackers_select_anon_active" on public.match_stat_trackers;

create policy "match_stat_trackers_select_staff"
  on public.match_stat_trackers for select to authenticated
  using ((select private.is_staff()) and (select private.has_match_access(match_id)));

create policy "match_stat_trackers_insert_staff"
  on public.match_stat_trackers for insert to authenticated
  with check ((select private.is_staff()) and (select private.has_match_access(match_id)));

create policy "match_stat_trackers_update_staff"
  on public.match_stat_trackers for update to authenticated
  using ((select private.is_staff()) and (select private.has_match_access(match_id)))
  with check ((select private.is_staff()) and (select private.has_match_access(match_id)));

create policy "match_stat_trackers_select_anon_active"
  on public.match_stat_trackers for select to anon
  using (revoked_at is null);

notify pgrst, 'reload schema';
