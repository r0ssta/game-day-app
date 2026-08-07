-- Plus/minus ledger per player per match (computed from goal + substitution events)
-- Run in Supabase SQL Editor (safe to re-run).

alter table public.match_stats
  add column if not exists plus_minus integer not null default 0;

create index if not exists idx_match_stats_plus_minus
  on public.match_stats (match_id, plus_minus);
