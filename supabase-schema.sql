-- Game Day App — Supabase schema
-- Run this in the Supabase SQL Editor for your project.

-- ---------------------------------------------------------------------------
-- Core tables (requested schema)
-- ---------------------------------------------------------------------------

create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  format text not null default '9v9' check (format in ('7v7', '9v9', '11v11')),
  primary_coach_name text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.coaches (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.players (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  first_name text not null,
  last_name text not null default '',
  jersey integer,
  active_status boolean not null default true,
  is_guest boolean not null default false,
  -- Roster position used by the lineup builder (GK, CB, CM, etc.)
  position text not null default 'SUB',
  primary_position text not null default 'Midfielder',
  secondary_position text not null default 'Midfielder',
  created_at timestamptz not null default now(),
  unique (team_id, jersey)
);

create table if not exists public.matches (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete restrict,
  coach_id uuid references public.coaches (id) on delete set null,
  coach_name text,
  opponent text not null default '',
  date timestamptz not null default now(),
  match_date date,
  match_time time,
  half_length integer not null default 30 check (half_length > 0),
  -- Live match fields (required for in-game UI + resume)
  location text not null default '',
  location_type text not null default 'home' check (location_type in ('home', 'away')),
  tournament_game boolean not null default false,
  home_score integer not null default 0 check (home_score >= 0),
  away_score integer not null default 0 check (away_score >= 0),
  clock_seconds integer not null default 0 check (clock_seconds >= 0),
  period text not null default '1st' check (period in ('1st', '2nd')),
  status text not null default 'active' check (status in ('active', 'scheduled', 'pending_review', 'completed')),
  period_clock_started boolean not null default false,
  coach_summary_notes text,
  stat_tracker_token text,
  created_at timestamptz not null default now()
);

create table if not exists public.match_events (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches (id) on delete cascade,
  player_id uuid references public.players (id) on delete cascade,
  event_type text not null check (event_type in (
    'goal', 'assist', 'sub_in', 'sub_out', 'position_change', 'opponent_goal', 'formation_change',
    'stat_shot_on_target', 'stat_shot_off_target', 'stat_goal', 'stat_assist', 'stat_dribble',
    'stat_tackle', 'stat_save', 'stat_pass', 'stat_key_pass', 'stat_team_log'
  )),
  timestamp integer not null check (timestamp >= 0),
  event_notes text,
  formation text,
  assist_player_id uuid references public.players (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint match_events_player_required_check check (event_type in ('opponent_goal', 'formation_change', 'stat_team_log') or player_id is not null)
);

create table if not exists public.match_stats (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches (id) on delete cascade,
  player_id uuid not null references public.players (id) on delete cascade,
  total_minutes numeric not null default 0,
  impact_score integer not null default 0 check (impact_score between -1 and 1),
  -- Per-match player state (single source of truth in DB, mirrored in React)
  match_status text not null default 'bench'
    check (match_status in ('on-field', 'bench', 'absent')),
  match_position text not null default 'CM',
  total_seconds_played integer not null default 0 check (total_seconds_played >= 0),
  plus_minus integer not null default 0,
  subbed_in_at integer,
  is_first_half_starter boolean not null default false,
  is_second_half_starter boolean not null default false,
  attending boolean not null default true,
  created_at timestamptz not null default now(),
  unique (match_id, player_id)
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

create index if not exists idx_players_team_id on public.players (team_id);
create index if not exists idx_matches_status on public.matches (status);
create unique index if not exists idx_matches_stat_tracker_token
  on public.matches (stat_tracker_token)
  where stat_tracker_token is not null;
create index if not exists idx_match_events_match_id on public.match_events (match_id);
create index if not exists idx_match_events_assist_player_id on public.match_events (assist_player_id);
create index if not exists idx_match_stats_match_id on public.match_stats (match_id);

create table if not exists public.match_reviews (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches (id) on delete cascade,
  player_id uuid not null references public.players (id) on delete cascade,
  position text not null default 'Overall',
  impact_score integer not null default 0 check (impact_score between -1 and 1),
  review_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (match_id, player_id, position)
);

create index if not exists idx_match_reviews_match_id on public.match_reviews (match_id);

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

create table if not exists public.match_stat_trackers (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches (id) on delete cascade,
  token text not null unique,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  unique (match_id)
);

create index if not exists idx_match_stat_trackers_match_id on public.match_stat_trackers (match_id);
create index if not exists idx_match_stat_trackers_token on public.match_stat_trackers (token);

-- ---------------------------------------------------------------------------
-- Staff roles (Supabase Auth)
-- ---------------------------------------------------------------------------

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

revoke all on public.user_roles from anon, authenticated;
grant select, update on public.user_roles to authenticated;

create policy "user_roles_select_own"
  on public.user_roles for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "user_roles_update_own_display_name"
  on public.user_roles for update to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and role = (select private.current_staff_role())
  );

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

-- ---------------------------------------------------------------------------
-- Row Level Security (staff roles + token-based sideline access)
-- ---------------------------------------------------------------------------

alter table public.teams enable row level security;
alter table public.coaches enable row level security;
alter table public.players enable row level security;
alter table public.matches enable row level security;
alter table public.match_events enable row level security;
alter table public.match_stats enable row level security;
alter table public.match_reviews enable row level security;
alter table public.lineup_presets enable row level security;
alter table public.match_stat_trackers enable row level security;

-- Teams
create policy "teams_select_staff" on public.teams for select to authenticated using ((select private.is_staff()));
create policy "teams_insert_staff" on public.teams for insert to authenticated with check ((select private.is_staff()));
create policy "teams_update_staff" on public.teams for update to authenticated using ((select private.is_staff())) with check ((select private.is_staff()));
create policy "teams_delete_staff" on public.teams for delete to authenticated using ((select private.can_manage_destructive()));
create policy "teams_select_stat_tracker" on public.teams for select to anon using (
  exists (
    select 1 from public.matches m
    join public.match_stat_trackers t on t.match_id = m.id
    where m.team_id = teams.id and t.revoked_at is null
  )
);

-- Coaches
create policy "coaches_select_staff" on public.coaches for select to authenticated using ((select private.is_staff()));
create policy "coaches_insert_staff" on public.coaches for insert to authenticated with check ((select private.is_staff()));
create policy "coaches_update_staff" on public.coaches for update to authenticated using ((select private.is_staff())) with check ((select private.is_staff()));

-- Players
create policy "players_select_staff" on public.players for select to authenticated using ((select private.is_staff()));
create policy "players_insert_staff" on public.players for insert to authenticated with check ((select private.is_staff()));
create policy "players_update_staff" on public.players for update to authenticated using ((select private.is_staff())) with check ((select private.is_staff()));
create policy "players_select_stat_tracker" on public.players for select to anon using (
  exists (
    select 1 from public.matches m
    join public.match_stat_trackers t on t.match_id = m.id
    where m.team_id = players.team_id and t.revoked_at is null
  )
);

-- Matches
create policy "matches_select_staff" on public.matches for select to authenticated using ((select private.is_staff()));
create policy "matches_insert_staff" on public.matches for insert to authenticated with check ((select private.is_staff()));
create policy "matches_update_staff" on public.matches for update to authenticated using ((select private.is_staff())) with check ((select private.is_staff()));
create policy "matches_delete_staff" on public.matches for delete to authenticated using ((select private.can_manage_destructive()));
create policy "matches_select_stat_tracker" on public.matches for select to anon using (
  exists (
    select 1 from public.match_stat_trackers t
    where t.match_id = matches.id and t.revoked_at is null
  )
);

-- Match events (sideline writes go through log_stat_tracker_event RPC)
create policy "match_events_select_staff" on public.match_events for select to authenticated using ((select private.is_staff()));
create policy "match_events_insert_staff" on public.match_events for insert to authenticated with check ((select private.is_staff()));
create policy "match_events_delete_staff" on public.match_events for delete to authenticated using ((select private.can_manage_destructive()));
create policy "match_events_select_stat_tracker" on public.match_events for select to anon using (
  exists (
    select 1 from public.match_stat_trackers t
    where t.match_id = match_events.match_id and t.revoked_at is null
  )
);

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
    match_id, player_id, event_type, timestamp, event_notes, formation
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

-- Match stats
create policy "match_stats_select_staff" on public.match_stats for select to authenticated using ((select private.is_staff()));
create policy "match_stats_insert_staff" on public.match_stats for insert to authenticated with check ((select private.is_staff()));
create policy "match_stats_update_staff" on public.match_stats for update to authenticated using ((select private.is_staff())) with check ((select private.is_staff()));
create policy "match_stats_select_stat_tracker" on public.match_stats for select to anon using (
  exists (
    select 1 from public.match_stat_trackers t
    where t.match_id = match_stats.match_id and t.revoked_at is null
  )
);

-- Match reviews
create policy "match_reviews_select_staff" on public.match_reviews for select to authenticated using ((select private.is_staff()));
create policy "match_reviews_insert_staff" on public.match_reviews for insert to authenticated with check ((select private.is_staff()));
create policy "match_reviews_update_staff" on public.match_reviews for update to authenticated using ((select private.is_staff())) with check ((select private.is_staff()));

-- Lineup presets
create policy "lineup_presets_select_staff" on public.lineup_presets for select to authenticated using ((select private.is_staff()));
create policy "lineup_presets_insert_staff" on public.lineup_presets for insert to authenticated with check ((select private.is_staff()));
create policy "lineup_presets_update_staff" on public.lineup_presets for update to authenticated using ((select private.is_staff())) with check ((select private.is_staff()));
create policy "lineup_presets_delete_staff" on public.lineup_presets for delete to authenticated using ((select private.can_manage_destructive()));

-- Stat tracker tokens
create policy "match_stat_trackers_select_staff" on public.match_stat_trackers for select to authenticated using ((select private.is_staff()));
create policy "match_stat_trackers_insert_staff" on public.match_stat_trackers for insert to authenticated with check ((select private.is_staff()));
create policy "match_stat_trackers_update_staff" on public.match_stat_trackers for update to authenticated using ((select private.is_staff())) with check ((select private.is_staff()));
create policy "match_stat_trackers_select_anon_active" on public.match_stat_trackers for select to anon using (revoked_at is null);

-- ---------------------------------------------------------------------------
-- Table privileges (required — RLS alone is not enough)
-- ---------------------------------------------------------------------------

grant usage on schema public to anon, authenticated;

grant select, insert, update, delete on public.teams to authenticated;
grant select, insert, update on public.coaches to authenticated;
grant select, insert, update on public.players to authenticated;
grant select, insert, update, delete on public.matches to authenticated;
grant select, insert, delete on public.match_events to authenticated;
grant select, insert, update on public.match_stats to authenticated;
grant select, insert, update on public.match_reviews to authenticated;
grant select, insert, update, delete on public.lineup_presets to authenticated;
grant select, insert, update on public.match_stat_trackers to authenticated;

grant select on public.teams to anon;
grant select on public.players to anon;
grant select on public.matches to anon;
grant select on public.match_events to anon;
grant select on public.match_stats to anon;
grant select on public.match_stat_trackers to anon;

grant usage, select on all sequences in schema public to anon, authenticated;

alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public
  grant usage, select on sequences to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Optional seed data
-- ---------------------------------------------------------------------------

insert into public.teams (name)
values ('FC Richmond')
on conflict (name) do nothing;
