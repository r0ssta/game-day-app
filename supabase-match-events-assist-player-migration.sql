-- Link assists to goal events via assist_player_id

alter table public.match_events
  add column if not exists assist_player_id uuid references public.players (id) on delete set null;

create index if not exists idx_match_events_assist_player_id on public.match_events (assist_player_id);
