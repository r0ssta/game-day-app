-- Game Day backlog: parent RSVP, postpone/cancel, arrival notes,
-- coach-only safety cards, and the Saturday minutes target.
-- Safe to re-run.

-- ---------------------------------------------------------------------------
-- Match status + arrival
-- ---------------------------------------------------------------------------

do $$
declare
  r record;
begin
  for r in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'matches'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%scheduled%'
      and pg_get_constraintdef(con.oid) ilike '%pending_review%'
  loop
    execute format('alter table public.matches drop constraint %I', r.conname);
  end loop;
end $$;

alter table public.matches
  add constraint matches_status_check
  check (status in (
    'scheduled',
    'postponed',
    'cancelled',
    'live',
    'extra_time_first_half',
    'extra_time_second_half',
    'penalty_shootout',
    'pending_review',
    'final'
  ));

alter table public.matches
  add column if not exists place_name text,
  add column if not exists place_details text,
  add column if not exists arrival_note text;

comment on column public.matches.place_name is
  'Field or venue name shown on the Parent Hub kickoff card.';
comment on column public.matches.place_details is
  'Parking, pin, or other arrival detail for families.';
comment on column public.matches.arrival_note is
  'When to arrive, shown on the Parent Hub kickoff card.';

-- ---------------------------------------------------------------------------
-- Minutes target
-- ---------------------------------------------------------------------------

alter table public.teams
  add column if not exists minutes_target_ratio numeric not null default 0.5;

alter table public.teams
  drop constraint if exists teams_minutes_target_ratio_check;

alter table public.teams
  add constraint teams_minutes_target_ratio_check
  check (minutes_target_ratio > 0 and minutes_target_ratio <= 1);

comment on column public.teams.minutes_target_ratio is
  'Share of completed-match minutes. The Saturday board flags players under this.';

-- ---------------------------------------------------------------------------
-- Parent RSVP
-- ---------------------------------------------------------------------------

create table if not exists public.match_rsvps (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches (id) on delete cascade,
  player_id uuid not null references public.players (id) on delete cascade,
  response text not null check (response in ('in', 'out', 'maybe')),
  updated_at timestamptz not null default now(),
  unique (match_id, player_id)
);

create index if not exists idx_match_rsvps_player_id on public.match_rsvps (player_id);

alter table public.match_rsvps enable row level security;

revoke all on public.match_rsvps from public, anon;
grant select, insert, update, delete on public.match_rsvps to authenticated;

drop policy if exists match_rsvps_select_staff on public.match_rsvps;
create policy match_rsvps_select_staff
  on public.match_rsvps for select to authenticated
  using ((select private.is_staff()) and (select private.has_match_access(match_id)));

drop policy if exists match_rsvps_insert_staff on public.match_rsvps;
create policy match_rsvps_insert_staff
  on public.match_rsvps for insert to authenticated
  with check ((select private.is_staff()) and (select private.has_match_access(match_id)));

drop policy if exists match_rsvps_update_staff on public.match_rsvps;
create policy match_rsvps_update_staff
  on public.match_rsvps for update to authenticated
  using ((select private.is_staff()) and (select private.has_match_access(match_id)))
  with check ((select private.is_staff()) and (select private.has_match_access(match_id)));

drop policy if exists match_rsvps_delete_staff on public.match_rsvps;
create policy match_rsvps_delete_staff
  on public.match_rsvps for delete to authenticated
  using ((select private.is_staff()) and (select private.has_match_access(match_id)));

-- ---------------------------------------------------------------------------
-- Coach-only safety card (separate from players so anon stat-tracker reads stay name-only)
-- ---------------------------------------------------------------------------

create table if not exists public.player_safety (
  player_id uuid primary key references public.players (id) on delete cascade,
  emergency_contact_name text,
  emergency_contact_phone text,
  allergies text,
  medical_notes text,
  unavailable_until date,
  updated_at timestamptz not null default now()
);

alter table public.player_safety enable row level security;

revoke all on public.player_safety from public, anon;
grant select, insert, update, delete on public.player_safety to authenticated;

drop policy if exists player_safety_select_staff on public.player_safety;
create policy player_safety_select_staff
  on public.player_safety for select to authenticated
  using (
    exists (
      select 1
      from public.players p
      where p.id = player_id
        and (select private.is_staff_of_club(p.club_id))
    )
  );

drop policy if exists player_safety_insert_staff on public.player_safety;
create policy player_safety_insert_staff
  on public.player_safety for insert to authenticated
  with check (
    exists (
      select 1
      from public.players p
      where p.id = player_id
        and (select private.is_staff_of_club(p.club_id))
    )
  );

drop policy if exists player_safety_update_staff on public.player_safety;
create policy player_safety_update_staff
  on public.player_safety for update to authenticated
  using (
    exists (
      select 1
      from public.players p
      where p.id = player_id
        and (select private.is_staff_of_club(p.club_id))
    )
  )
  with check (
    exists (
      select 1
      from public.players p
      where p.id = player_id
        and (select private.is_staff_of_club(p.club_id))
    )
  );

drop policy if exists player_safety_delete_staff on public.player_safety;
create policy player_safety_delete_staff
  on public.player_safety for delete to authenticated
  using (
    exists (
      select 1
      from public.players p
      where p.id = player_id
        and (select private.is_staff_of_club(p.club_id))
    )
  );

comment on table public.player_safety is
  'Sideline safety card. Staff only. unavailable_until is the first day the player can be selected.';

-- ---------------------------------------------------------------------------
-- Parent RSVP write (no account). Also updates match_stats while the fixture is open.
-- ---------------------------------------------------------------------------

create or replace function public.set_parent_match_rsvp(
  p_slug text,
  p_match_id uuid,
  p_player_id uuid,
  p_response text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_team_id uuid;
  v_status text;
  v_is_test boolean;
  v_season_id uuid;
begin
  if p_response is null or p_response not in ('in', 'out', 'maybe') then
    raise exception 'Invalid response';
  end if;

  select t.id into v_team_id
  from public.teams t
  where t.slug = lower(trim(coalesce(p_slug, '')))
    and t.active_status is distinct from false;

  if v_team_id is null then
    raise exception 'Team not found';
  end if;

  select m.status, coalesce(m.is_test, false)
    into v_status, v_is_test
  from public.matches m
  where m.id = p_match_id
    and m.team_id = v_team_id;

  if not found or v_is_test then
    raise exception 'Match not found';
  end if;

  if v_status not in ('scheduled', 'postponed') then
    raise exception 'Availability is closed';
  end if;

  select s.id into v_season_id
  from public.seasons s
  where s.status = 'active'
  order by s.created_at desc
  limit 1;

  if v_season_id is null or not exists (
    select 1
    from public.season_rosters sr
    join public.players p on p.id = sr.player_id
    where sr.season_id = v_season_id
      and sr.team_id = v_team_id
      and sr.player_id = p_player_id
      and p.active_status is distinct from false
  ) then
    raise exception 'Player is not on this team';
  end if;

  insert into public.match_rsvps (match_id, player_id, response)
  values (p_match_id, p_player_id, p_response)
  on conflict (match_id, player_id)
  do update set response = excluded.response, updated_at = now();

  update public.match_stats ms
  set
    attending = (p_response <> 'out'),
    match_status = case
      when p_response = 'out' then 'absent'
      when ms.match_status = 'absent' then 'bench'
      else ms.match_status
    end,
    is_first_half_starter = case
      when p_response = 'out' then false
      else ms.is_first_half_starter
    end,
    subbed_in_at = case when p_response = 'out' then null else ms.subbed_in_at end
  where ms.match_id = p_match_id
    and ms.player_id = p_player_id;

  return jsonb_build_object('ok', true, 'response', p_response);
end;
$$;

revoke all on function public.set_parent_match_rsvp(text, uuid, uuid, text) from public;
grant execute on function public.set_parent_match_rsvp(text, uuid, uuid, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Public calendar feed (no medical fields, no test matches)
-- ---------------------------------------------------------------------------

create or replace function public.get_team_schedule(p_slug text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_team public.teams%rowtype;
  v_events jsonb;
begin
  select * into v_team
  from public.teams
  where slug = lower(trim(coalesce(p_slug, '')))
    and active_status is distinct from false;

  if not found then
    raise exception 'Team not found';
  end if;

  select coalesce(jsonb_agg(row_to_json(e)::jsonb order by e.sort_ts), '[]'::jsonb)
    into v_events
  from (
    select
      mt.id,
      mt.opponent,
      mt.status,
      mt.match_date,
      mt.match_time,
      mt.date,
      case
        when lower(trim(coalesce(mt.location, ''))) = 'away' then 'away'
        else 'home'
      end as location_type,
      mt.place_name,
      mt.place_details,
      mt.arrival_note,
      mt.period_length,
      mt.total_periods,
      mt.half_length,
      coalesce(
        (mt.match_date::text || 'T' || coalesce(left(mt.match_time::text, 8), '12:00:00'))::timestamptz,
        mt.date
      ) as sort_ts
    from public.matches mt
    where mt.team_id = v_team.id
      and coalesce(mt.is_test, false) = false
      and mt.status in ('scheduled', 'postponed', 'cancelled', 'live', 'pending_review', 'final')
      and coalesce(mt.match_date, mt.date::date) between (current_date - 14) and (current_date + 120)
  ) e;

  return jsonb_build_object(
    'teamName', v_team.name,
    'teamSlug', v_team.slug,
    'ageGroup', v_team.age_group,
    'events', v_events
  );
end;
$$;

revoke all on function public.get_team_schedule(text) from public;
grant execute on function public.get_team_schedule(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Parent Hub: arrival, RSVP, postponed / cancelled
-- ---------------------------------------------------------------------------

drop function if exists public.get_parent_hub_by_slug(text);
drop function if exists public.get_parent_hub(uuid);

create or replace function public.get_parent_hub(p_team_id uuid, p_include_test boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_team public.teams%rowtype;
  v_season_id uuid;
  v_players jsonb;
  v_matches jsonb;
  v_include_test boolean := coalesce(p_include_test, false)
    and private.has_team_access(p_team_id);
begin
  select * into v_team
  from public.teams
  where id = p_team_id
    and active_status is distinct from false;

  if not found then
    raise exception 'Team not found';
  end if;

  select s.id into v_season_id
  from public.seasons s
  where s.status = 'active'
  order by s.created_at desc
  limit 1;

  if v_season_id is null then
    v_players := '[]'::jsonb;
  else
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', p.id,
          'firstName', p.first_name,
          'lastName', p.last_name,
          'number', coalesce(sr.primary_jersey_number, p.jersey)
        )
        order by coalesce(sr.primary_jersey_number, p.jersey) nulls last, p.last_name, p.first_name
      ),
      '[]'::jsonb
    )
    into v_players
    from public.season_rosters sr
    join public.players p on p.id = sr.player_id
    where sr.season_id = v_season_id
      and sr.team_id = p_team_id
      and p.active_status is distinct from false;
  end if;

  select coalesce(
    jsonb_agg(row_to_json(m)::jsonb order by m.sort_ts),
    '[]'::jsonb
  )
  into v_matches
  from (
    select
      mt.id,
      mt.opponent,
      mt.status,
      mt.match_date,
      mt.match_time,
      mt.date,
      case
        when lower(trim(coalesce(mt.location, ''))) = 'away' then 'away'
        else 'home'
      end as location_type,
      mt.place_name,
      mt.place_details,
      mt.arrival_note,
      mt.home_score,
      mt.away_score,
      mt.home_pk_score,
      mt.away_pk_score,
      mt.pk_winner_is_us,
      mt.period,
      mt.current_period,
      mt.total_periods,
      mt.period_length,
      mt.half_length,
      mt.period_clock_started,
      mt.clock_seconds,
      mt.parent_facing_recap,
      coalesce(mt.is_test, false) as "isTest",
      coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'id', p.id,
              'firstName', p.first_name,
              'lastName', p.last_name,
              'number', p.jersey,
              'position', ms.match_position
            )
            order by p.jersey nulls last, p.last_name, p.first_name
          )
          from public.match_stats ms
          join public.players p on p.id = ms.player_id
          where ms.match_id = mt.id
            and ms.is_first_half_starter = true
            and ms.attending is distinct from false
        ),
        '[]'::jsonb
      ) as starters,
      case
        when mt.status in ('scheduled', 'postponed') then coalesce(
          (
            select jsonb_agg(
              jsonb_build_object(
                'playerId', r.player_id,
                'response', r.response
              )
              order by r.updated_at
            )
            from public.match_rsvps r
            where r.match_id = mt.id
          ),
          '[]'::jsonb
        )
        else '[]'::jsonb
      end as rsvps,
      coalesce(
        (mt.match_date::text || 'T' || coalesce(left(mt.match_time::text, 8), '12:00:00'))::timestamptz,
        mt.date
      ) as sort_ts
    from public.matches mt
    where mt.team_id = p_team_id
      and mt.status in (
        'scheduled',
        'postponed',
        'cancelled',
        'live',
        'extra_time_first_half',
        'extra_time_second_half',
        'penalty_shootout',
        'final',
        'pending_review'
      )
      and (
        mt.status <> 'cancelled'
        or coalesce(mt.match_date, mt.date::date) >= (current_date - 2)
      )
      and (
        coalesce(mt.is_test, false) = false
        or v_include_test
      )
  ) m;

  return jsonb_build_object(
    'teamId', v_team.id,
    'teamSlug', v_team.slug,
    'teamName', v_team.name,
    'ageGroup', v_team.age_group,
    'brandColor', v_team.brand_color,
    'logoUrl', v_team.logo_url,
    'players', v_players,
    'matches', v_matches,
    'staffPreview', v_include_test
  );
end;
$$;

create or replace function public.get_parent_hub_by_slug(p_slug text, p_include_test boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_team_id uuid;
  v_slug text := lower(trim(coalesce(p_slug, '')));
begin
  if v_slug = '' then
    raise exception 'Team not found';
  end if;

  select t.id into v_team_id
  from public.teams t
  where t.slug = v_slug
    and t.active_status is distinct from false;

  if v_team_id is null then
    raise exception 'Team not found';
  end if;

  return public.get_parent_hub(v_team_id, p_include_test);
end;
$$;

revoke all on function public.get_parent_hub(uuid, boolean) from public;
grant execute on function public.get_parent_hub(uuid, boolean) to anon, authenticated;

revoke all on function public.get_parent_hub_by_slug(text, boolean) from public;
grant execute on function public.get_parent_hub_by_slug(text, boolean) to anon, authenticated;

notify pgrst, 'reload schema';
