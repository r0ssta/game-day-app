-- Per-team PWA branding for Parent Hub install (Home Screen name, theme, icon).

alter table public.teams
  add column if not exists brand_color text not null default '#12141c';

alter table public.teams
  add column if not exists logo_url text;

update public.teams
set brand_color = '#12141c'
where brand_color is null or btrim(brand_color) = '';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'teams_brand_color_hex_check'
      and conrelid = 'public.teams'::regclass
  ) then
    alter table public.teams
      add constraint teams_brand_color_hex_check
      check (brand_color ~* '^#[0-9a-f]{6}$');
  end if;
end $$;

-- Lightweight public branding lookup for /api/manifest
create or replace function public.get_team_pwa_branding(p_slug text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_team public.teams%rowtype;
  v_slug text := lower(trim(coalesce(p_slug, '')));
begin
  if v_slug = '' then
    return null;
  end if;

  select * into v_team
  from public.teams
  where slug = v_slug
    and active_status is distinct from false;

  if not found then
    return null;
  end if;

  return jsonb_build_object(
    'slug', v_team.slug,
    'name', v_team.name,
    'brandColor', v_team.brand_color,
    'logoUrl', v_team.logo_url
  );
end;
$$;

revoke all on function public.get_team_pwa_branding(text) from public;
grant execute on function public.get_team_pwa_branding(text) to anon, authenticated;

-- Include branding on Parent Hub payload
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
    'brandColor', v_team.brand_color,
    'logoUrl', v_team.logo_url,
    'players', v_players,
    'matches', v_matches
  );
end;
$$;

revoke all on function public.get_parent_hub(uuid) from public;
grant execute on function public.get_parent_hub(uuid) to anon, authenticated;
