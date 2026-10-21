-- List queries filter matches by team or season, then status and date,
-- and read a match's events in created_at order.

create index if not exists idx_matches_team_id
  on public.matches (team_id);

create index if not exists idx_matches_team_status_date
  on public.matches (team_id, status, match_date);

create index if not exists idx_matches_season_team_date
  on public.matches (season_id, team_id, match_date);

create index if not exists idx_match_events_match_created
  on public.match_events (match_id, created_at);
