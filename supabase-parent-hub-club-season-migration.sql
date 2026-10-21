-- Parent Hub: active season is per club, and the list payload skips heavy fields.
-- Starters and RSVPs are loaded only for live matches and a short date window.
-- Coach recaps move to get_parent_recaps so the 30-second hub reload stays small.

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
    and s.club_id = v_team.club_id
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
      coalesce(mt.is_test, false) as "isTest",
      case
        when mt.status in (
          'live',
          'extra_time_first_half',
          'extra_time_second_half',
          'penalty_shootout',
          'scheduled',
          'postponed'
        )
          or coalesce(mt.match_date, mt.date::date) >= (current_date - 2)
        then coalesce(
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
        )
        else '[]'::jsonb
      end as starters,
      case
        when mt.status in ('scheduled', 'postponed')
          and (
            coalesce(mt.match_date, mt.date::date) is null
            or coalesce(mt.match_date, mt.date::date) between (current_date - 2) and (current_date + 21)
          )
        then coalesce(
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

create or replace function public.get_parent_recaps(p_team_id uuid, p_include_test boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_include_test boolean := coalesce(p_include_test, false)
    and private.has_team_access(p_team_id);
begin
  if not exists (
    select 1
    from public.teams
    where id = p_team_id
      and active_status is distinct from false
  ) then
    raise exception 'Team not found';
  end if;

  return coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'id', mt.id,
          'parent_facing_recap', mt.parent_facing_recap
        )
        order by coalesce(mt.match_date, mt.date::date) desc nulls last
      )
      from public.matches mt
      where mt.team_id = p_team_id
        and mt.status in ('final', 'pending_review')
        and mt.parent_facing_recap is not null
        and btrim(mt.parent_facing_recap) <> ''
        and (
          coalesce(mt.is_test, false) = false
          or v_include_test
        )
    ),
    '[]'::jsonb
  );
end;
$$;

revoke all on function public.get_parent_hub(uuid, boolean) from public;
grant execute on function public.get_parent_hub(uuid, boolean) to anon, authenticated;

revoke all on function public.get_parent_recaps(uuid, boolean) from public;
grant execute on function public.get_parent_recaps(uuid, boolean) to anon, authenticated;
