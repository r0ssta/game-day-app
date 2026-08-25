-- Flag regulation goals scored from the penalty spot (not shootout attempts).
-- Safe to re-run.

alter table public.match_events
  add column if not exists is_pk boolean not null default false;

comment on column public.match_events.is_pk is
  'True when a goal / opponent_goal was scored from a penalty kick during regulation.';
