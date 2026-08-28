-- Parent / Fan Hub: Web Push subscriptions + public read RPCs.

create table if not exists public.web_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  team_id uuid not null references public.teams (id) on delete cascade,
  target_player_id uuid null references public.players (id) on delete set null,
  user_agent text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint web_push_subscriptions_endpoint_unique unique (endpoint)
);

create index if not exists idx_web_push_subscriptions_team
  on public.web_push_subscriptions (team_id);

create index if not exists idx_web_push_subscriptions_target_player
  on public.web_push_subscriptions (team_id, target_player_id)
  where target_player_id is not null;

alter table public.web_push_subscriptions enable row level security;

revoke all on public.web_push_subscriptions from anon, authenticated;
grant select, delete on public.web_push_subscriptions to authenticated;

drop policy if exists "web_push_subscriptions_select_staff" on public.web_push_subscriptions;
drop policy if exists "web_push_subscriptions_delete_staff" on public.web_push_subscriptions;

create policy "web_push_subscriptions_select_staff"
  on public.web_push_subscriptions for select to authenticated
  using ((select private.is_staff()));

create policy "web_push_subscriptions_delete_staff"
  on public.web_push_subscriptions for delete to authenticated
  using ((select private.is_staff()));

-- Parent-safe match event feed for live games (anon can read while match is active).
drop policy if exists "match_events_select_parent_live" on public.match_events;
create policy "match_events_select_parent_live"
  on public.match_events for select to anon
  using (
    exists (
      select 1
      from public.matches m
      join public.teams t on t.id = m.team_id
      where m.id = match_events.match_id
        and m.status = 'active'
        and t.active_status is distinct from false
        and match_events.event_type in (
          'goal',
          'opponent_goal',
          'yellow_card',
          'red_card',
          'sub_in',
          'sub_out'
        )
    )
  );

-- Ensure Realtime can deliver parent live updates.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime add table public.match_events;
    exception
      when duplicate_object then null;
    end;
  end if;
end $$;

-- Public Team Hub payload: team + roster + sanitized matches.
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
    'teamName', v_team.name,
    'ageGroup', v_team.age_group,
    'players', v_players,
    'matches', v_matches
  );
end;
$$;

revoke all on function public.get_parent_hub(uuid) from public;
grant execute on function public.get_parent_hub(uuid) to anon, authenticated;

-- Live match events with player display names (for initial hydrate).
create or replace function public.get_parent_live_events(p_match_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match public.matches%rowtype;
  v_events jsonb;
begin
  select * into v_match
  from public.matches
  where id = p_match_id
    and status = 'active';

  if not found then
    return '[]'::jsonb;
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', e.id,
        'matchId', e.match_id,
        'playerId', e.player_id,
        'playerName', case
          when e.player_id is null then null
          else trim(both from coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, ''))
        end,
        'jersey', p.jersey,
        'eventType', e.event_type,
        'timestamp', e."timestamp",
        'eventNotes', e.event_notes,
        'isPk', e.is_pk,
        'assistPlayerId', e.assist_player_id,
        'assistPlayerName', case
          when e.assist_player_id is null then null
          else trim(both from coalesce(ap.first_name, '') || ' ' || coalesce(ap.last_name, ''))
        end,
        'createdAt', e.created_at
      )
      order by e."timestamp" asc, e.created_at asc
    ),
    '[]'::jsonb
  )
  into v_events
  from public.match_events e
  left join public.players p on p.id = e.player_id
  left join public.players ap on ap.id = e.assist_player_id
  where e.match_id = p_match_id
    and e.event_type in (
      'goal',
      'opponent_goal',
      'yellow_card',
      'red_card',
      'sub_in',
      'sub_out'
    );

  return v_events;
end;
$$;

revoke all on function public.get_parent_live_events(uuid) from public;
grant execute on function public.get_parent_live_events(uuid) to anon, authenticated;

notify pgrst, 'reload schema';
