-- Primary / secondary roster positions for player profiles

alter table public.players
  add column if not exists primary_position text not null default 'Midfielder';

alter table public.players
  add column if not exists secondary_position text not null default 'Midfielder';
