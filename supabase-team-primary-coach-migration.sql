-- Default head coach per team + denormalized coach name on each match

alter table public.teams
  add column if not exists primary_coach_name text not null default '';

alter table public.matches
  add column if not exists coach_name text;

-- Backfill coach_name from coaches table for existing matches
update public.matches m
set coach_name = c.name
from public.coaches c
where m.coach_id = c.id
  and (m.coach_name is null or trim(m.coach_name) = '');
