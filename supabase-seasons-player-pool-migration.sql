-- Seasons, age-group player pool, and season rosters
-- Decouples players from static team assignment; match history stays on player_id.

-- ---------------------------------------------------------------------------
-- Seasons
-- ---------------------------------------------------------------------------

create table if not exists public.seasons (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  status text not null default 'active'
    check (status in ('active', 'archived')),
  starts_on date,
  ends_on date,
  created_at timestamptz not null default now(),
  constraint seasons_month_range_check check (
    starts_on is null
    or ends_on is null
    or ends_on >= starts_on
  )
);

create unique index if not exists seasons_name_unique
  on public.seasons (lower(name));

-- At most one active season
create unique index if not exists seasons_one_active
  on public.seasons ((status))
  where status = 'active';

create index if not exists idx_seasons_status on public.seasons (status);

alter table public.seasons enable row level security;

revoke all on public.seasons from anon, authenticated;
grant select on public.seasons to authenticated;
grant insert, update on public.seasons to authenticated;

drop policy if exists "seasons_select_staff" on public.seasons;
drop policy if exists "seasons_insert_director" on public.seasons;
drop policy if exists "seasons_update_director" on public.seasons;

create policy "seasons_select_staff"
  on public.seasons for select to authenticated
  using ((select private.is_staff()));

create policy "seasons_insert_director"
  on public.seasons for insert to authenticated
  with check ((select private.is_director()));

create policy "seasons_update_director"
  on public.seasons for update to authenticated
  using ((select private.is_director()))
  with check ((select private.is_director()));

-- Seed an active season if none exists
insert into public.seasons (name, status)
select 'Current Season', 'active'
where not exists (select 1 from public.seasons where status = 'active');

-- ---------------------------------------------------------------------------
-- Players: add age_group; detach from static team (after roster backfill)
-- ---------------------------------------------------------------------------

alter table public.players
  add column if not exists age_group text;

alter table public.players
  drop constraint if exists players_age_group_check;

alter table public.players
  add constraint players_age_group_check
  check (
    age_group is null
    or age_group in ('U9', 'U10', 'U11', 'U12', 'U13', 'U14', 'U15', 'U16')
  );

-- Backfill age_group from the player's current team
update public.players p
set age_group = t.age_group
from public.teams t
where p.team_id = t.id
  and p.age_group is null
  and t.age_group is not null;

update public.players
set age_group = 'U13'
where age_group is null;

alter table public.players
  alter column age_group set not null;

create index if not exists idx_players_age_group on public.players (age_group);

-- ---------------------------------------------------------------------------
-- Season rosters (player ↔ team assignment for a season)
-- ---------------------------------------------------------------------------

create table if not exists public.season_rosters (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons (id) on delete cascade,
  team_id uuid not null references public.teams (id) on delete cascade,
  player_id uuid not null references public.players (id) on delete cascade,
  primary_jersey_number integer,
  created_at timestamptz not null default now(),
  unique (season_id, team_id, player_id)
);

create unique index if not exists season_rosters_team_jersey_unique
  on public.season_rosters (season_id, team_id, primary_jersey_number)
  where primary_jersey_number is not null;

create index if not exists idx_season_rosters_season_team
  on public.season_rosters (season_id, team_id);

create index if not exists idx_season_rosters_player
  on public.season_rosters (player_id);

alter table public.season_rosters enable row level security;

revoke all on public.season_rosters from anon, authenticated;
grant select, insert, update, delete on public.season_rosters to authenticated;

drop policy if exists "season_rosters_select_staff" on public.season_rosters;
drop policy if exists "season_rosters_insert_staff" on public.season_rosters;
drop policy if exists "season_rosters_update_staff" on public.season_rosters;
drop policy if exists "season_rosters_delete_staff" on public.season_rosters;

create policy "season_rosters_select_staff"
  on public.season_rosters for select to authenticated
  using (
    (select private.is_staff())
    and (select private.has_team_access(team_id))
  );

create policy "season_rosters_insert_staff"
  on public.season_rosters for insert to authenticated
  with check (
    (select private.is_staff())
    and (select private.has_team_access(team_id))
  );

create policy "season_rosters_update_staff"
  on public.season_rosters for update to authenticated
  using (
    (select private.is_staff())
    and (select private.has_team_access(team_id))
  )
  with check (
    (select private.is_staff())
    and (select private.has_team_access(team_id))
  );

create policy "season_rosters_delete_staff"
  on public.season_rosters for delete to authenticated
  using (
    (select private.is_staff())
    and (select private.has_team_access(team_id))
  );

-- Backfill primary season roster from existing team-bound players
insert into public.season_rosters (season_id, team_id, player_id, primary_jersey_number)
select s.id, p.team_id, p.id, p.jersey
from public.players p
cross join lateral (
  select id from public.seasons where status = 'active' order by created_at desc limit 1
) s
where p.team_id is not null
on conflict (season_id, team_id, player_id) do nothing;

-- ---------------------------------------------------------------------------
-- Matches belong to a season; archived seasons are read-only
-- ---------------------------------------------------------------------------

alter table public.matches
  add column if not exists season_id uuid references public.seasons (id);

update public.matches m
set season_id = s.id
from (
  select id from public.seasons where status = 'active' order by created_at desc limit 1
) s
where m.season_id is null;

alter table public.matches
  alter column season_id set not null;

create index if not exists idx_matches_season_id on public.matches (season_id);

alter table public.match_stats
  add column if not exists is_match_guest boolean not null default false;

-- Prevent writes against archived seasons
create or replace function private.enforce_active_season_match_writes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
begin
  select status into v_status
  from public.seasons
  where id = new.season_id;

  if v_status is distinct from 'active' then
    raise exception 'Matches can only be created or changed for the active season'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_matches_active_season on public.matches;
create trigger trg_matches_active_season
  before insert or update on public.matches
  for each row
  execute function private.enforce_active_season_match_writes();

-- ---------------------------------------------------------------------------
-- Detach players from static team_id
-- ---------------------------------------------------------------------------

-- Policies referencing players.team_id must be dropped before the column
drop policy if exists "players_select_staff" on public.players;
drop policy if exists "players_insert_staff" on public.players;
drop policy if exists "players_update_staff" on public.players;
drop policy if exists "players_select_stat_tracker" on public.players;

alter table public.players
  drop constraint if exists players_team_jersey_unique;

drop index if exists players_team_jersey_unique;
drop index if exists idx_players_team_id;

alter table public.players
  drop constraint if exists players_team_id_fkey;

-- Drop any leftover CHECK / generated deps on team_id
do $$
declare
  r record;
begin
  for r in
    select c.conname
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'players'
      and pg_get_constraintdef(c.oid) ilike '%team_id%'
  loop
    execute format('alter table public.players drop constraint if exists %I', r.conname);
  end loop;
end $$;

alter table public.players
  drop column if exists team_id;

-- Club-wide player visibility for staff (pool model)
create policy "players_select_staff"
  on public.players for select to authenticated
  using ((select private.is_staff()));

create policy "players_insert_staff"
  on public.players for insert to authenticated
  with check ((select private.is_staff()));

create policy "players_update_staff"
  on public.players for update to authenticated
  using ((select private.is_staff()))
  with check ((select private.is_staff()));

-- Stat tracker: players linked via match_stats for an active tracker match
create policy "players_select_stat_tracker"
  on public.players for select to anon
  using (
    exists (
      select 1
      from public.match_stats ms
      join public.match_stat_trackers t on t.match_id = ms.match_id
      where ms.player_id = players.id
        and t.revoked_at is null
    )
  );

-- Helper: activate a season (archives others)
create or replace function public.set_active_season(p_season_id uuid)
returns public.seasons
language plpgsql
security definer
set search_path = public
as $$
declare
  v_season public.seasons;
begin
  if not private.is_director() then
    raise exception 'Only directors can set the active season'
      using errcode = '42501';
  end if;

  update public.seasons
  set status = 'archived'
  where status = 'active'
    and id is distinct from p_season_id;

  update public.seasons
  set status = 'active'
  where id = p_season_id
  returning * into v_season;

  if v_season.id is null then
    raise exception 'Season not found';
  end if;

  return v_season;
end;
$$;

revoke all on function public.set_active_season(uuid) from public;
grant execute on function public.set_active_season(uuid) to authenticated;

notify pgrst, 'reload schema';
