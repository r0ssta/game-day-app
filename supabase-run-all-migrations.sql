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
  add constraint match_reviews_match_player_position_key
  unique (match_id, player_id, position);
