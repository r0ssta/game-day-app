-- B-tree indexes on hot foreign keys.
-- There is no `evaluations` table; post-match ratings live on `match_reviews`.
-- `match_id` is already indexed on match_events, match_reviews, and match_stats.

create index if not exists idx_matches_team_id
  on public.matches using btree (team_id);

create index if not exists idx_matches_pk_gk_player_id
  on public.matches using btree (pk_gk_player_id);

create index if not exists idx_match_events_player_id
  on public.match_events using btree (player_id);

create index if not exists idx_match_reviews_player_id
  on public.match_reviews using btree (player_id);

create index if not exists idx_match_stats_player_id
  on public.match_stats using btree (player_id);
