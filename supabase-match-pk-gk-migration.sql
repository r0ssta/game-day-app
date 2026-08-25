-- Our goalkeeper for the penalty kick shootout.
-- Safe to re-run.

alter table public.matches
  add column if not exists pk_gk_player_id uuid references public.players (id) on delete set null;

comment on column public.matches.pk_gk_player_id is
  'Our goalkeeper for the penalty shootout (facing opponent takers).';
