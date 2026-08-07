-- Run all pending match schema updates (safe to re-run)

-- Position change notes + event type
alter table public.match_events
  add column if not exists event_notes text;

alter table public.match_events
  drop constraint if exists match_events_event_type_check;

alter table public.match_events
  add constraint match_events_event_type_check
  check (event_type in ('goal', 'assist', 'sub_in', 'sub_out', 'position_change'));

-- Formation snapshot on events
alter table public.match_events
  add column if not exists formation text;

-- Scheduled kickoff date/time on matches
alter table public.matches
  add column if not exists match_date date;

alter table public.matches
  add column if not exists match_time time;

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

-- Assist linked on goal events
alter table public.match_events
  add column if not exists assist_player_id uuid references public.players (id) on delete set null;

create index if not exists idx_match_events_assist_player_id on public.match_events (assist_player_id);
