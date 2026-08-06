-- Post-game coach reviews per player per match

create table if not exists public.match_reviews (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches (id) on delete cascade,
  player_id uuid not null references public.players (id) on delete cascade,
  impact_score integer not null default 0 check (impact_score between -1 and 1),
  review_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (match_id, player_id)
);

create index if not exists idx_match_reviews_match_id on public.match_reviews (match_id);

alter table public.match_reviews enable row level security;

create policy "match_reviews_select_all" on public.match_reviews for select to anon, authenticated using (true);
create policy "match_reviews_insert_all" on public.match_reviews for insert to anon, authenticated with check (true);
create policy "match_reviews_update_all" on public.match_reviews for update to anon, authenticated using (true) with check (true);
