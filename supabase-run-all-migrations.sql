-- Run all pending match schema updates (safe to re-run)

-- Position change notes + event type
alter table public.match_events
  add column if not exists event_notes text;

alter table public.match_events
  drop constraint if exists match_events_event_type_check;

alter table public.match_events
  add constraint match_events_event_type_check
  check (event_type in ('goal', 'assist', 'sub_in', 'sub_out', 'position_change', 'opponent_goal'));

-- Formation snapshot on events
alter table public.match_events
  add column if not exists formation text;

-- Scheduled kickoff date/time on matches
alter table public.matches
  add column if not exists match_date date;

alter table public.matches
  add column if not exists match_time time;

-- Post-game coach reviews per player per match
create table if not exists public.match_reviews (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches (id) on delete cascade,
  player_id uuid not null references public.players (id) on delete cascade,
  impact_score integer not null default 0 check (impact_score between -1 and 1),
  review_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (match_id, player_id)
);

create index if not exists idx_match_reviews_match_id on public.match_reviews (match_id);

alter table public.match_reviews enable row level security;

create policy "match_reviews_select_all" on public.match_reviews for select to anon, authenticated using (true);
create policy "match_reviews_insert_all" on public.match_reviews for insert to anon, authenticated with check (true);
create policy "match_reviews_update_all" on public.match_reviews for update to anon, authenticated using (true) with check (true);

-- Assist linked on goal events
alter table public.match_events
  add column if not exists assist_player_id uuid references public.players (id) on delete set null;

alter table public.players
  add column if not exists contact_info text;

create index if not exists idx_match_events_assist_player_id on public.match_events (assist_player_id);

-- Saved lineup presets per team
create table if not exists public.lineup_presets (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  preset_name text not null,
  formation_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (team_id, preset_name)
);

create index if not exists idx_lineup_presets_team_id on public.lineup_presets (team_id);

alter table public.lineup_presets enable row level security;

create policy "lineup_presets_select_all" on public.lineup_presets for select to anon, authenticated using (true);
create policy "lineup_presets_insert_all" on public.lineup_presets for insert to anon, authenticated with check (true);
create policy "lineup_presets_update_all" on public.lineup_presets for update to anon, authenticated using (true) with check (true);
create policy "lineup_presets_delete_all" on public.lineup_presets for delete to anon, authenticated using (true);

-- Roster primary / secondary positions
alter table public.players
  add column if not exists primary_position text not null default 'Midfielder';

alter table public.players
  add column if not exists secondary_position text not null default 'Midfielder';

-- Coach executive summary on completed matches
alter table public.matches
  add column if not exists coach_summary_notes text;

-- Team match format (7v7, 9v9, 11v11)
alter table public.teams
  add column if not exists format text not null default '9v9';

alter table public.teams
  drop constraint if exists teams_format_check;

alter table public.teams
  add constraint teams_format_check
  check (format in ('7v7', '9v9', '11v11'));

-- Opponent goal events (no player attribution)
alter table public.match_events
  drop constraint if exists match_events_event_type_check;

alter table public.match_events
  add constraint match_events_event_type_check
  check (event_type in ('goal', 'assist', 'sub_in', 'sub_out', 'position_change', 'opponent_goal'));

alter table public.match_events
  alter column player_id drop not null;

alter table public.match_events
  drop constraint if exists match_events_player_required_check;

alter table public.match_events
  add constraint match_events_player_required_check
  check (event_type = 'opponent_goal' or player_id is not null);

-- Player first_name / last_name (replaces name; drops contact_info)
alter table public.players
  add column if not exists first_name text;

alter table public.players
  add column if not exists last_name text;

update public.players
set
  first_name = case
    when first_name is not null and trim(first_name) <> '' then trim(first_name)
    when name is not null and position(' ' in trim(name)) > 0 then trim(split_part(trim(name), ' ', 1))
    when name is not null then trim(name)
    else 'Player'
  end,
  last_name = case
    when last_name is not null and trim(last_name) <> '' then trim(last_name)
    when name is not null and position(' ' in trim(name)) > 0 then trim(substring(trim(name) from position(' ' in trim(name)) + 1))
    else ''
  end
where first_name is null or trim(coalesce(first_name, '')) = '';

update public.players set last_name = coalesce(last_name, '') where last_name is null;

alter table public.players alter column first_name set not null;
alter table public.players alter column last_name set not null;
alter table public.players alter column last_name set default '';

alter table public.players drop column if exists name;
alter table public.players drop column if exists contact_info;

-- Team primary coach default + match coach_name persistence
alter table public.teams
  add column if not exists primary_coach_name text not null default '';

alter table public.matches
  add column if not exists coach_name text;

update public.matches m
set coach_name = c.name
from public.coaches c
where m.coach_id = c.id
  and (m.coach_name is null or trim(m.coach_name) = '');

-- Home / Away venue type for matches
alter table public.matches
  add column if not exists location_type text not null default 'home';

alter table public.matches
  drop constraint if exists matches_location_type_check;

alter table public.matches
  add constraint matches_location_type_check
  check (location_type in ('home', 'away'));

update public.matches
set location_type = 'away'
where lower(trim(coalesce(location, ''))) = 'away';

update public.matches
set location_type = 'home'
where location_type is null or trim(location_type) = '';

-- Post-game recap drafts: pending_review until finalized
alter table public.matches
  drop constraint if exists matches_status_check;

alter table public.matches
  add constraint matches_status_check
  check (status in ('active', 'pending_review', 'completed'));

-- Live formation change events (no player_id required)
alter table public.match_events
  drop constraint if exists match_events_event_type_check;

alter table public.match_events
  add constraint match_events_event_type_check
  check (event_type in ('goal', 'assist', 'sub_in', 'sub_out', 'position_change', 'opponent_goal', 'formation_change'));

alter table public.match_events
  drop constraint if exists match_events_player_required_check;

alter table public.match_events
  add constraint match_events_player_required_check
  check (event_type in ('opponent_goal', 'formation_change') or player_id is not null);

-- Per-position post-game ratings
alter table public.match_reviews
  add column if not exists position text;

update public.match_reviews
set position = 'Overall'
where position is null;

alter table public.match_reviews
  alter column position set default 'Overall';

alter table public.match_reviews
  alter column position set not null;

alter table public.match_reviews
  drop constraint if exists match_reviews_match_id_player_id_key;

alter table public.match_reviews
  drop constraint if exists match_reviews_match_player_position_key;

alter table public.match_reviews
  add constraint match_reviews_match_player_position_key
  unique (match_id, player_id, position);

-- Plus/minus per player per match
alter table public.match_stats
  add column if not exists plus_minus integer not null default 0;

create index if not exists idx_match_stats_plus_minus
  on public.match_stats (match_id, plus_minus);

-- Stat tracker: token on matches + supplemental micro-event types
alter table public.matches
  add column if not exists stat_tracker_token text;

create unique index if not exists idx_matches_stat_tracker_token
  on public.matches (stat_tracker_token)
  where stat_tracker_token is not null;

create table if not exists public.match_stat_trackers (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches (id) on delete cascade,
  token text not null unique,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  unique (match_id)
);

create index if not exists idx_match_stat_trackers_match_id
  on public.match_stat_trackers (match_id);

create index if not exists idx_match_stat_trackers_token
  on public.match_stat_trackers (token);

alter table public.match_stat_trackers enable row level security;

drop policy if exists "match_stat_trackers_select_all" on public.match_stat_trackers;
drop policy if exists "match_stat_trackers_insert_all" on public.match_stat_trackers;
drop policy if exists "match_stat_trackers_update_all" on public.match_stat_trackers;

create policy "match_stat_trackers_select_all"
  on public.match_stat_trackers for select to anon, authenticated using (true);

create policy "match_stat_trackers_insert_all"
  on public.match_stat_trackers for insert to anon, authenticated with check (true);

create policy "match_stat_trackers_update_all"
  on public.match_stat_trackers for update to anon, authenticated using (true) with check (true);

grant all on public.match_stat_trackers to anon, authenticated;

alter table public.match_events
  drop constraint if exists match_events_event_type_check;

alter table public.match_events
  add constraint match_events_event_type_check
  check (event_type in (
    'goal',
    'assist',
    'sub_in',
    'sub_out',
    'position_change',
    'opponent_goal',
    'formation_change',
    'stat_shot_on_target',
    'stat_shot_off_target',
    'stat_goal',
    'stat_assist',
    'stat_dribble',
    'stat_tackle',
    'stat_save',
    'stat_pass',
    'stat_key_pass',
    'stat_team_log'
  ));

alter table public.match_events
  drop constraint if exists match_events_player_required_check;

alter table public.match_events
  add constraint match_events_player_required_check
  check (event_type in ('opponent_goal', 'formation_change', 'stat_team_log') or player_id is not null);

-- Pre-game schedule imports (Sprocket ICS, etc.)
alter table public.matches
  drop constraint if exists matches_status_check;

alter table public.matches
  add constraint matches_status_check
  check (status in ('active', 'scheduled', 'pending_review', 'completed'));
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

-- Add staff_role.pending in its own transaction.
-- Postgres forbids using a newly added enum value in the same transaction
-- that created it, so this file must stay separate from migrations that
-- insert/default to 'pending'.

do $$
begin
  if not exists (
    select 1
    from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public'
      and t.typname = 'staff_role'
      and e.enumlabel = 'pending'
  ) then
    alter type public.staff_role add value 'pending';
  end if;
exception
  when undefined_object then
    create type public.staff_role as enum (
      'director',
      'head_coach',
      'assistant_coach',
      'pending'
    );
end $$;

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
    set role = case
          when public.user_roles.role = 'director'::public.staff_role
           and excluded.role in (
             'head_coach'::public.staff_role,
             'assistant_coach'::public.staff_role
           )
          then public.user_roles.role
          else excluded.role
        end,
        display_name = coalesce(excluded.display_name, public.user_roles.display_name),
        updated_at = now();

  update public.profiles
  set
    display_name = coalesce(nullif(trim(coalesce(p_display_name, '')), ''), display_name),
    updated_at = now()
  where id = p_user_id;

  delete from public.team_members where user_id = p_user_id;

  -- Team membership role follows the coaching assignment, not club director.
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

-- Age groups on teams (Virginia Velocity lineup defaults)

alter table public.teams
  add column if not exists age_group text;

alter table public.teams
  drop constraint if exists teams_age_group_check;

alter table public.teams
  add constraint teams_age_group_check
  check (
    age_group is null
    or age_group in ('U9', 'U10', 'U11', 'U12', 'U13', 'U14', 'U15', 'U16')
  );

create index if not exists idx_teams_age_group on public.teams (age_group);

-- Best-effort backfill from team name patterns like "U13" / "u11"
update public.teams t
set age_group = 'U' || upper(m[1])
from (
  select
    id,
    regexp_match(name, '(?i)\bu(9|10|11|12|13|14|15|16)\b') as m
  from public.teams
) matched
where t.id = matched.id
  and t.age_group is null
  and matched.m is not null;

-- Align format with age group when we could infer one
update public.teams
set format = case
  when age_group in ('U9', 'U10') then '7v7'
  when age_group in ('U11', 'U12') then '9v9'
  when age_group in ('U13', 'U14', 'U15', 'U16') then '11v11'
  else format
end
where age_group is not null;

notify pgrst, 'reload schema';

-- Directors only: change team name / age group / format.
-- Other staff may still update non-profile fields (e.g. primary_coach_name).

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
     and not private.is_director() then
    raise exception 'Only club directors can change team name, age group, or format'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_teams_profile_director on public.teams;
create trigger trg_teams_profile_director
  before update on public.teams
  for each row
  execute function private.enforce_team_profile_director();

-- Keep insert director-only (idempotent rename for clarity)
drop policy if exists "teams_insert_staff" on public.teams;
drop policy if exists "teams_insert_director" on public.teams;
create policy "teams_insert_director"
  on public.teams for insert to authenticated
  with check ((select private.is_director()));

notify pgrst, 'reload schema';

-- Allow directors to delete teams that still have match history.
-- Match child rows already cascade from matches.

alter table public.matches
  drop constraint if exists matches_team_id_fkey;

alter table public.matches
  add constraint matches_team_id_fkey
  foreign key (team_id) references public.teams (id) on delete cascade;

-- Ensure delete remains director-only
drop policy if exists "teams_delete_staff" on public.teams;
drop policy if exists "teams_delete_director" on public.teams;
create policy "teams_delete_director"
  on public.teams for delete to authenticated
  using ((select private.is_director()));

notify pgrst, 'reload schema';

-- Seasons, age-group player pool, and season rosters
-- Decouples players from static team assignment; match history stays on player_id.

-- ---------------------------------------------------------------------------
-- Seasons
-- ---------------------------------------------------------------------------

create table if not exists public.seasons (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  status text not null default 'active'
    check (status in ('active', 'archived')),
  starts_on date,
  ends_on date,
  created_at timestamptz not null default now(),
  constraint seasons_month_range_check check (
    starts_on is null
    or ends_on is null
    or ends_on >= starts_on
  )
);

create unique index if not exists seasons_name_unique
  on public.seasons (lower(name));

-- At most one active season
create unique index if not exists seasons_one_active
  on public.seasons ((status))
  where status = 'active';

create index if not exists idx_seasons_status on public.seasons (status);

alter table public.seasons enable row level security;

revoke all on public.seasons from anon, authenticated;
grant select on public.seasons to authenticated;
grant insert, update on public.seasons to authenticated;

drop policy if exists "seasons_select_staff" on public.seasons;
drop policy if exists "seasons_insert_director" on public.seasons;
drop policy if exists "seasons_update_director" on public.seasons;

create policy "seasons_select_staff"
  on public.seasons for select to authenticated
  using ((select private.is_staff()));

create policy "seasons_insert_director"
  on public.seasons for insert to authenticated
  with check ((select private.is_director()));

create policy "seasons_update_director"
  on public.seasons for update to authenticated
  using ((select private.is_director()))
  with check ((select private.is_director()));

-- Seed an active season if none exists
insert into public.seasons (name, status)
select 'Current Season', 'active'
where not exists (select 1 from public.seasons where status = 'active');

-- ---------------------------------------------------------------------------
-- Players: add age_group; detach from static team (after roster backfill)
-- ---------------------------------------------------------------------------

alter table public.players
  add column if not exists age_group text;

alter table public.players
  drop constraint if exists players_age_group_check;

alter table public.players
  add constraint players_age_group_check
  check (
    age_group is null
    or age_group in ('U9', 'U10', 'U11', 'U12', 'U13', 'U14', 'U15', 'U16')
  );

-- Backfill age_group from the player's current team
update public.players p
set age_group = t.age_group
from public.teams t
where p.team_id = t.id
  and p.age_group is null
  and t.age_group is not null;

update public.players
set age_group = 'U13'
where age_group is null;

alter table public.players
  alter column age_group set not null;

create index if not exists idx_players_age_group on public.players (age_group);

-- ---------------------------------------------------------------------------
-- Season rosters (player ↔ team assignment for a season)
-- ---------------------------------------------------------------------------

create table if not exists public.season_rosters (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons (id) on delete cascade,
  team_id uuid not null references public.teams (id) on delete cascade,
  player_id uuid not null references public.players (id) on delete cascade,
  primary_jersey_number integer,
  created_at timestamptz not null default now(),
  unique (season_id, team_id, player_id)
);

create unique index if not exists season_rosters_team_jersey_unique
  on public.season_rosters (season_id, team_id, primary_jersey_number)
  where primary_jersey_number is not null;

create index if not exists idx_season_rosters_season_team
  on public.season_rosters (season_id, team_id);

create index if not exists idx_season_rosters_player
  on public.season_rosters (player_id);

alter table public.season_rosters enable row level security;

revoke all on public.season_rosters from anon, authenticated;
grant select, insert, update, delete on public.season_rosters to authenticated;

drop policy if exists "season_rosters_select_staff" on public.season_rosters;
drop policy if exists "season_rosters_insert_staff" on public.season_rosters;
drop policy if exists "season_rosters_update_staff" on public.season_rosters;
drop policy if exists "season_rosters_delete_staff" on public.season_rosters;

create policy "season_rosters_select_staff"
  on public.season_rosters for select to authenticated
  using (
    (select private.is_staff())
    and (select private.has_team_access(team_id))
  );

create policy "season_rosters_insert_staff"
  on public.season_rosters for insert to authenticated
  with check (
    (select private.is_staff())
    and (select private.has_team_access(team_id))
  );

create policy "season_rosters_update_staff"
  on public.season_rosters for update to authenticated
  using (
    (select private.is_staff())
    and (select private.has_team_access(team_id))
  )
  with check (
    (select private.is_staff())
    and (select private.has_team_access(team_id))
  );

create policy "season_rosters_delete_staff"
  on public.season_rosters for delete to authenticated
  using (
    (select private.is_staff())
    and (select private.has_team_access(team_id))
  );

-- Backfill primary season roster from existing team-bound players
insert into public.season_rosters (season_id, team_id, player_id, primary_jersey_number)
select s.id, p.team_id, p.id, p.jersey
from public.players p
cross join lateral (
  select id from public.seasons where status = 'active' order by created_at desc limit 1
) s
where p.team_id is not null
on conflict (season_id, team_id, player_id) do nothing;

-- ---------------------------------------------------------------------------
-- Matches belong to a season; archived seasons are read-only
-- ---------------------------------------------------------------------------

alter table public.matches
  add column if not exists season_id uuid references public.seasons (id);

update public.matches m
set season_id = s.id
from (
  select id from public.seasons where status = 'active' order by created_at desc limit 1
) s
where m.season_id is null;

alter table public.matches
  alter column season_id set not null;

create index if not exists idx_matches_season_id on public.matches (season_id);

alter table public.match_stats
  add column if not exists is_match_guest boolean not null default false;

-- Prevent writes against archived seasons
create or replace function private.enforce_active_season_match_writes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
begin
  select status into v_status
  from public.seasons
  where id = new.season_id;

  if v_status is distinct from 'active' then
    raise exception 'Matches can only be created or changed for the active season'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_matches_active_season on public.matches;
create trigger trg_matches_active_season
  before insert or update on public.matches
  for each row
  execute function private.enforce_active_season_match_writes();

-- ---------------------------------------------------------------------------
-- Detach players from static team_id
-- ---------------------------------------------------------------------------

alter table public.players
  drop constraint if exists players_team_jersey_unique;

drop index if exists players_team_jersey_unique;

alter table public.players
  drop constraint if exists players_team_id_fkey;

alter table public.players
  alter column team_id drop not null;

-- Keep team_id temporarily nullable for any legacy reads, then drop
alter table public.players
  drop column if exists team_id;

-- Club-wide player visibility for staff (pool model)
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

-- Stat tracker: players linked via match_stats for an active tracker match
create policy "players_select_stat_tracker"
  on public.players for select to anon
  using (
    exists (
      select 1
      from public.match_stats ms
      join public.match_stat_trackers t on t.match_id = ms.match_id
      where ms.player_id = players.id
        and t.revoked_at is null
    )
  );

-- Helper: activate a season (archives others)
create or replace function public.set_active_season(p_season_id uuid)
returns public.seasons
language plpgsql
security definer
set search_path = public
as $$
declare
  v_season public.seasons;
begin
  if not private.is_director() then
    raise exception 'Only directors can set the active season'
      using errcode = '42501';
  end if;

  update public.seasons
  set status = 'archived'
  where status = 'active'
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

-- ---------------------------------------------------------------------------
-- Season start/end months
-- ---------------------------------------------------------------------------

alter table public.seasons
  add column if not exists starts_on date;

alter table public.seasons
  add column if not exists ends_on date;

alter table public.seasons
  drop constraint if exists seasons_month_range_check;

alter table public.seasons
  add constraint seasons_month_range_check
  check (
    starts_on is null
    or ends_on is null
    or ends_on >= starts_on
  );

-- ---------------------------------------------------------------------------
-- Soft-archive teams (players already use active_status)
-- ---------------------------------------------------------------------------

alter table public.teams
  add column if not exists active_status boolean not null default true;

create index if not exists idx_teams_active_status
  on public.teams (active_status);

alter table public.teams
  drop constraint if exists teams_name_key;

drop index if exists teams_name_active_unique;
create unique index teams_name_active_unique
  on public.teams (lower(name))
  where active_status = true;

drop policy if exists "teams_delete_staff" on public.teams;
drop policy if exists "teams_delete_director" on public.teams;

revoke delete on public.teams from authenticated;
revoke delete on public.players from authenticated;

notify pgrst, 'reload schema';
