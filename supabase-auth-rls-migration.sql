-- Auth roles + RLS for coaching staff (idempotent)

create schema if not exists private;

do $$ begin
  create type public.staff_role as enum ('director', 'head_coach', 'assistant_coach');
exception
  when duplicate_object then null;
end $$;

create table if not exists public.user_roles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role public.staff_role not null default 'assistant_coach',
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_user_roles_user_id on public.user_roles (user_id);
create index if not exists idx_user_roles_role on public.user_roles (role);

alter table public.user_roles enable row level security;

-- ---------------------------------------------------------------------------
-- Role helper functions (cached auth.uid() pattern; SECURITY DEFINER for RLS)
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

revoke all on function private.current_staff_role() from public;
revoke all on function private.is_staff() from public;
revoke all on function private.can_manage_destructive() from public;
grant execute on function private.current_staff_role() to authenticated;
grant execute on function private.is_staff() to authenticated;
grant execute on function private.can_manage_destructive() to authenticated;

-- Roles are assigned by trigger / service role — staff can only read own row
-- and update display_name (role column must stay unchanged).
revoke all on public.user_roles from anon, authenticated;
grant select, update on public.user_roles to authenticated;

drop policy if exists "user_roles_select_own" on public.user_roles;
create policy "user_roles_select_own"
  on public.user_roles
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "user_roles_update_own_display_name" on public.user_roles;
create policy "user_roles_update_own_display_name"
  on public.user_roles
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and role = (select private.current_staff_role())
  );

-- Auto-provision assistant_coach on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_roles (user_id, role, display_name)
  values (
    new.id,
    'assistant_coach',
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

-- Backfill roles for any users created before this migration
insert into public.user_roles (user_id, role, display_name)
select
  u.id,
  'assistant_coach',
  nullif(trim(coalesce(u.raw_user_meta_data ->> 'display_name', '')), '')
from auth.users u
on conflict (user_id) do nothing;

-- ---------------------------------------------------------------------------
-- Replace open MVP policies with role-based + token-safe sideline access
-- ---------------------------------------------------------------------------

-- TEAMS
drop policy if exists "teams_select_all" on public.teams;
drop policy if exists "teams_insert_all" on public.teams;
drop policy if exists "teams_update_all" on public.teams;
drop policy if exists "teams_delete_staff" on public.teams;
drop policy if exists "teams_select_staff" on public.teams;
drop policy if exists "teams_insert_staff" on public.teams;
drop policy if exists "teams_update_staff" on public.teams;

create policy "teams_select_staff"
  on public.teams for select to authenticated
  using ((select private.is_staff()));

create policy "teams_insert_staff"
  on public.teams for insert to authenticated
  with check ((select private.is_staff()));

create policy "teams_update_staff"
  on public.teams for update to authenticated
  using ((select private.is_staff()))
  with check ((select private.is_staff()));

create policy "teams_delete_staff"
  on public.teams for delete to authenticated
  using ((select private.can_manage_destructive()));

-- Sideline: read team for an active tracker match
drop policy if exists "teams_select_stat_tracker" on public.teams;
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
  using ((select private.is_staff()));

create policy "matches_insert_staff"
  on public.matches for insert to authenticated
  with check ((select private.is_staff()));

create policy "matches_update_staff"
  on public.matches for update to authenticated
  using ((select private.is_staff()))
  with check ((select private.is_staff()));

create policy "matches_delete_staff"
  on public.matches for delete to authenticated
  using ((select private.can_manage_destructive()));

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
drop policy if exists "match_events_insert_stat_tracker" on public.match_events;

create policy "match_events_select_staff"
  on public.match_events for select to authenticated
  using ((select private.is_staff()));

create policy "match_events_insert_staff"
  on public.match_events for insert to authenticated
  with check ((select private.is_staff()));

create policy "match_events_delete_staff"
  on public.match_events for delete to authenticated
  using ((select private.can_manage_destructive()));

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

-- Direct anon inserts blocked; use security-definer RPC with token check instead.
create or replace function public.log_stat_tracker_event(
  p_match_id uuid,
  p_token text,
  p_event_type text,
  p_timestamp integer,
  p_player_id uuid default null,
  p_event_notes text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
begin
  if p_token is null or length(trim(p_token)) = 0 then
    raise exception 'Invalid or expired stat tracker link.';
  end if;

  if not exists (
    select 1
    from public.match_stat_trackers t
    where t.match_id = p_match_id
      and t.token = p_token
      and t.revoked_at is null
  ) then
    raise exception 'Invalid or expired stat tracker link.';
  end if;

  select m.status into v_status
  from public.matches m
  where m.id = p_match_id;

  if v_status is distinct from 'active' then
    raise exception 'This match is no longer accepting sideline stats.';
  end if;

  if p_event_type not in (
    'stat_shot_on_target', 'stat_shot_off_target', 'stat_goal', 'stat_assist',
    'stat_dribble', 'stat_tackle', 'stat_save', 'stat_pass', 'stat_key_pass',
    'stat_team_log'
  ) then
    raise exception 'Unsupported sideline event type.';
  end if;

  insert into public.match_events (
    match_id,
    player_id,
    event_type,
    timestamp,
    event_notes,
    formation
  ) values (
    p_match_id,
    case when p_event_type = 'stat_team_log' then null else p_player_id end,
    p_event_type,
    greatest(p_timestamp, 0),
    p_event_notes,
    ''
  );
end;
$$;

revoke all on function public.log_stat_tracker_event(uuid, text, text, integer, uuid, text) from public;
grant execute on function public.log_stat_tracker_event(uuid, text, text, integer, uuid, text) to anon, authenticated;

-- PLAYERS (needed by coaches + sideline roster)
drop policy if exists "players_select_all" on public.players;
drop policy if exists "players_insert_all" on public.players;
drop policy if exists "players_update_all" on public.players;
drop policy if exists "players_select_staff" on public.players;
drop policy if exists "players_insert_staff" on public.players;
drop policy if exists "players_update_staff" on public.players;
drop policy if exists "players_select_stat_tracker" on public.players;

create policy "players_select_staff"
  on public.players for select to authenticated
  using ((select private.is_staff()));

create policy "players_insert_staff"
  on public.players for insert to authenticated
  with check ((select private.is_staff()));

create policy "players_update_staff"
  on public.players for update to authenticated
  using ((select private.is_staff()))
  with check ((select private.is_staff()));

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

-- MATCH STATS / REVIEWS / PRESETS / TRACKERS / COACHES
drop policy if exists "match_stats_select_all" on public.match_stats;
drop policy if exists "match_stats_insert_all" on public.match_stats;
drop policy if exists "match_stats_update_all" on public.match_stats;
drop policy if exists "match_stats_select_staff" on public.match_stats;
drop policy if exists "match_stats_insert_staff" on public.match_stats;
drop policy if exists "match_stats_update_staff" on public.match_stats;
drop policy if exists "match_stats_select_stat_tracker" on public.match_stats;

create policy "match_stats_select_staff"
  on public.match_stats for select to authenticated
  using ((select private.is_staff()));

create policy "match_stats_insert_staff"
  on public.match_stats for insert to authenticated
  with check ((select private.is_staff()));

create policy "match_stats_update_staff"
  on public.match_stats for update to authenticated
  using ((select private.is_staff()))
  with check ((select private.is_staff()));

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

drop policy if exists "match_reviews_select_all" on public.match_reviews;
drop policy if exists "match_reviews_insert_all" on public.match_reviews;
drop policy if exists "match_reviews_update_all" on public.match_reviews;
drop policy if exists "match_reviews_select_staff" on public.match_reviews;
drop policy if exists "match_reviews_insert_staff" on public.match_reviews;
drop policy if exists "match_reviews_update_staff" on public.match_reviews;

create policy "match_reviews_select_staff"
  on public.match_reviews for select to authenticated
  using ((select private.is_staff()));

create policy "match_reviews_insert_staff"
  on public.match_reviews for insert to authenticated
  with check ((select private.is_staff()));

create policy "match_reviews_update_staff"
  on public.match_reviews for update to authenticated
  using ((select private.is_staff()))
  with check ((select private.is_staff()));

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
  using ((select private.is_staff()));

create policy "lineup_presets_insert_staff"
  on public.lineup_presets for insert to authenticated
  with check ((select private.is_staff()));

create policy "lineup_presets_update_staff"
  on public.lineup_presets for update to authenticated
  using ((select private.is_staff()))
  with check ((select private.is_staff()));

create policy "lineup_presets_delete_staff"
  on public.lineup_presets for delete to authenticated
  using ((select private.can_manage_destructive()));

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

drop policy if exists "match_stat_trackers_select_all" on public.match_stat_trackers;
drop policy if exists "match_stat_trackers_insert_all" on public.match_stat_trackers;
drop policy if exists "match_stat_trackers_update_all" on public.match_stat_trackers;
drop policy if exists "match_stat_trackers_select_staff" on public.match_stat_trackers;
drop policy if exists "match_stat_trackers_insert_staff" on public.match_stat_trackers;
drop policy if exists "match_stat_trackers_update_staff" on public.match_stat_trackers;
drop policy if exists "match_stat_trackers_select_anon_active" on public.match_stat_trackers;

create policy "match_stat_trackers_select_staff"
  on public.match_stat_trackers for select to authenticated
  using ((select private.is_staff()));

create policy "match_stat_trackers_insert_staff"
  on public.match_stat_trackers for insert to authenticated
  with check ((select private.is_staff()));

create policy "match_stat_trackers_update_staff"
  on public.match_stat_trackers for update to authenticated
  using ((select private.is_staff()))
  with check ((select private.is_staff()));

create policy "match_stat_trackers_select_anon_active"
  on public.match_stat_trackers for select to anon
  using (revoked_at is null);

notify pgrst, 'reload schema';
