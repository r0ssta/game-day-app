-- Per-position post-game ratings (one row per player / match / position)

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
