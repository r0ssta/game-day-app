-- Stat tracker: token on matches + supplemental micro-event types
-- Safe to re-run.

alter table public.matches
  add column if not exists stat_tracker_token text;

create unique index if not exists idx_matches_stat_tracker_token
  on public.matches (stat_tracker_token)
  where stat_tracker_token is not null;

alter table public.match_events
  drop constraint if exists match_events_event_type_check;

alter table public.match_events
  add constraint match_events_event_type_check
  check (event_type in (
    'goal',
    'assist',
    'sub_in',
    'sub_out',
    'position_change',
    'opponent_goal',
    'formation_change',
    'stat_shot_on_target',
    'stat_shot_off_target',
    'stat_goal',
    'stat_assist',
    'stat_dribble',
    'stat_tackle',
    'stat_save',
    'stat_pass',
    'stat_key_pass',
    'stat_team_log'
  ));

alter table public.match_events
  drop constraint if exists match_events_player_required_check;

alter table public.match_events
  add constraint match_events_player_required_check
  check (event_type in ('opponent_goal', 'formation_change', 'stat_team_log') or player_id is not null);

-- Optional legacy table (ignore errors if you prefer the matches-column approach only)
create table if not exists public.match_stat_trackers (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches (id) on delete cascade,
  token text not null unique,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  unique (match_id)
);

alter table public.match_stat_trackers enable row level security;

drop policy if exists "match_stat_trackers_select_all" on public.match_stat_trackers;
drop policy if exists "match_stat_trackers_insert_all" on public.match_stat_trackers;
drop policy if exists "match_stat_trackers_update_all" on public.match_stat_trackers;

create policy "match_stat_trackers_select_all"
  on public.match_stat_trackers for select to anon, authenticated using (true);

create policy "match_stat_trackers_insert_all"
  on public.match_stat_trackers for insert to anon, authenticated with check (true);

create policy "match_stat_trackers_update_all"
  on public.match_stat_trackers for update to anon, authenticated using (true) with check (true);

grant all on public.match_stat_trackers to anon, authenticated;
