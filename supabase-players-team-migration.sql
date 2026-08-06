-- Link players to teams and track guest status.
-- Run this in the Supabase SQL Editor.

alter table public.players
  add column if not exists team_id uuid references public.teams (id) on delete cascade;

alter table public.players
  add column if not exists is_guest boolean not null default false;

-- Jersey numbers are unique per team (not globally).
alter table public.players
  drop constraint if exists players_jersey_key;

alter table public.players
  drop constraint if exists players_team_jersey_unique;

alter table public.players
  add constraint players_team_jersey_unique unique (team_id, jersey);

create index if not exists idx_players_team_id on public.players (team_id);

-- Optional jersey (blank in UI stores null)
alter table public.players alter column jersey drop not null;
