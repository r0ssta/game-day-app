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
  status text not null default 'active' check (status in ('active', 'pending_review', 'completed')),
  period_clock_started boolean not null default false,
  coach_summary_notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.match_events (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches (id) on delete cascade,
  player_id uuid references public.players (id) on delete cascade,
  event_type text not null check (event_type in ('goal', 'assist', 'sub_in', 'sub_out', 'position_change', 'opponent_goal', 'formation_change')),
  timestamp integer not null check (timestamp >= 0),
  event_notes text,
  formation text,
  assist_player_id uuid references public.players (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint match_events_player_required_check check (event_type in ('opponent_goal', 'formation_change') or player_id is not null)
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
create index if not exists idx_match_events_match_id on public.match_events (match_id);
create index if not exists idx_match_events_assist_player_id on public.match_events (assist_player_id);
create index if not exists idx_match_stats_match_id on public.match_stats (match_id);

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

-- ---------------------------------------------------------------------------
-- Row Level Security (MVP: open read/write for anon + authenticated)
-- ---------------------------------------------------------------------------

alter table public.teams enable row level security;
alter table public.coaches enable row level security;
alter table public.players enable row level security;
alter table public.matches enable row level security;
alter table public.match_events enable row level security;
alter table public.match_stats enable row level security;
alter table public.match_reviews enable row level security;
alter table public.lineup_presets enable row level security;

-- Teams
create policy "teams_select_all" on public.teams for select to anon, authenticated using (true);
create policy "teams_insert_all" on public.teams for insert to anon, authenticated with check (true);
create policy "teams_update_all" on public.teams for update to anon, authenticated using (true) with check (true);

-- Coaches
create policy "coaches_select_all" on public.coaches for select to anon, authenticated using (true);
create policy "coaches_insert_all" on public.coaches for insert to anon, authenticated with check (true);
create policy "coaches_update_all" on public.coaches for update to anon, authenticated using (true) with check (true);

-- Players
create policy "players_select_all" on public.players for select to anon, authenticated using (true);
create policy "players_insert_all" on public.players for insert to anon, authenticated with check (true);
create policy "players_update_all" on public.players for update to anon, authenticated using (true) with check (true);

-- Matches
create policy "matches_select_all" on public.matches for select to anon, authenticated using (true);
create policy "matches_insert_all" on public.matches for insert to anon, authenticated with check (true);
create policy "matches_update_all" on public.matches for update to anon, authenticated using (true) with check (true);

-- Match events
create policy "match_events_select_all" on public.match_events for select to anon, authenticated using (true);
create policy "match_events_insert_all" on public.match_events for insert to anon, authenticated with check (true);

-- Match stats
create policy "match_stats_select_all" on public.match_stats for select to anon, authenticated using (true);
create policy "match_stats_insert_all" on public.match_stats for insert to anon, authenticated with check (true);
create policy "match_stats_update_all" on public.match_stats for update to anon, authenticated using (true) with check (true);

-- Match reviews
create policy "match_reviews_select_all" on public.match_reviews for select to anon, authenticated using (true);
create policy "match_reviews_insert_all" on public.match_reviews for insert to anon, authenticated with check (true);
create policy "match_reviews_update_all" on public.match_reviews for update to anon, authenticated using (true) with check (true);

-- Lineup presets
create policy "lineup_presets_select_all" on public.lineup_presets for select to anon, authenticated using (true);
create policy "lineup_presets_insert_all" on public.lineup_presets for insert to anon, authenticated with check (true);
create policy "lineup_presets_update_all" on public.lineup_presets for update to anon, authenticated using (true) with check (true);
create policy "lineup_presets_delete_all" on public.lineup_presets for delete to anon, authenticated using (true);

-- ---------------------------------------------------------------------------
-- Table privileges (required — RLS alone is not enough)
-- ---------------------------------------------------------------------------

grant usage on schema public to anon, authenticated;

grant all on all tables in schema public to anon, authenticated;
grant all on all sequences in schema public to anon, authenticated;

alter default privileges in schema public
  grant all on tables to anon, authenticated;
alter default privileges in schema public
  grant all on sequences to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Optional seed data
-- ---------------------------------------------------------------------------

insert into public.teams (name)
values ('FC Richmond')
on conflict (name) do nothing;
