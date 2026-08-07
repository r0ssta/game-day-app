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
