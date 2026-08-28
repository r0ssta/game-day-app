-- Team Hub public URLs: unique slug per team (e.g. "Virginia Velocity" → "virginia-velocity").

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.slugify_team_name(p_name text)
returns text
language sql
immutable
set search_path = public
as $$
  select nullif(
    trim(both '-' from regexp_replace(
      regexp_replace(lower(trim(coalesce(p_name, ''))), '[^a-z0-9]+', '-', 'g'),
      '-{2,}',
      '-',
      'g'
    )),
    ''
  );
$$;

create or replace function public.allocate_team_slug(
  p_name text,
  p_exclude_id uuid default null
)
returns text
language plpgsql
set search_path = public
as $$
declare
  v_base text;
  v_candidate text;
  v_suffix integer := 2;
begin
  v_base := coalesce(public.slugify_team_name(p_name), 'team');
  v_candidate := v_base;

  while exists (
    select 1
    from public.teams t
    where t.slug = v_candidate
      and (p_exclude_id is null or t.id is distinct from p_exclude_id)
  ) loop
    v_candidate := v_base || '-' || v_suffix::text;
    v_suffix := v_suffix + 1;
  end loop;

  return v_candidate;
end;
$$;

create or replace function public.teams_set_slug()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.slug is null or btrim(new.slug) = '' then
      new.slug := public.allocate_team_slug(new.name, null);
    else
      new.slug := public.allocate_team_slug(new.slug, null);
    end if;
    return new;
  end if;

  -- UPDATE: regenerate when name changes and slug was not explicitly changed,
  -- or when slug is cleared.
  if new.name is distinct from old.name and new.slug is not distinct from old.slug then
    new.slug := public.allocate_team_slug(new.name, new.id);
  elsif new.slug is null or btrim(new.slug) = '' then
    new.slug := public.allocate_team_slug(new.name, new.id);
  elsif new.slug is distinct from old.slug then
    new.slug := public.allocate_team_slug(new.slug, new.id);
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Column + backfill
-- ---------------------------------------------------------------------------

alter table public.teams
  add column if not exists slug text;

update public.teams t
set slug = public.allocate_team_slug(t.name, t.id)
where t.slug is null or btrim(t.slug) = '';

alter table public.teams
  alter column slug set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'teams_slug_unique'
      and conrelid = 'public.teams'::regclass
  ) then
    alter table public.teams
      add constraint teams_slug_unique unique (slug);
  end if;
end $$;

drop trigger if exists teams_set_slug_biud on public.teams;
create trigger teams_set_slug_biud
  before insert or update of name, slug
  on public.teams
  for each row
  execute function public.teams_set_slug();

-- ---------------------------------------------------------------------------
-- Parent hub RPC: by id (existing) + by slug
-- ---------------------------------------------------------------------------

create or replace function public.get_parent_hub(p_team_id uuid)
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
      coalesce(
        (mt.match_date::text || 'T' || coalesce(left(mt.match_time::text, 8), '12:00:00'))::timestamptz,
        mt.date
      ) as sort_ts
    from public.matches mt
    where mt.team_id = p_team_id
      and mt.status in ('active', 'scheduled', 'completed', 'pending_review')
  ) m;

  return jsonb_build_object(
    'teamId', v_team.id,
    'teamSlug', v_team.slug,
    'teamName', v_team.name,
    'ageGroup', v_team.age_group,
    'players', v_players,
    'matches', v_matches
  );
end;
$$;

create or replace function public.get_parent_hub_by_slug(p_slug text)
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

  return public.get_parent_hub(v_team_id);
end;
$$;

revoke all on function public.get_parent_hub(uuid) from public;
grant execute on function public.get_parent_hub(uuid) to anon, authenticated;

revoke all on function public.get_parent_hub_by_slug(text) from public;
grant execute on function public.get_parent_hub_by_slug(text) to anon, authenticated;
