-- Multi-team + single-game Parent Hub push follows.
-- Devices stay on web_push_subscriptions (unique endpoint).
-- Follows live in junction tables so one device can follow many teams/games.

create table if not exists public.web_push_subscription_teams (
  subscription_id uuid not null references public.web_push_subscriptions (id) on delete cascade,
  team_id uuid not null references public.teams (id) on delete cascade,
  target_player_id uuid null references public.players (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (subscription_id, team_id)
);

create index if not exists idx_web_push_subscription_teams_team
  on public.web_push_subscription_teams (team_id);

create index if not exists idx_web_push_subscription_teams_player
  on public.web_push_subscription_teams (team_id, target_player_id)
  where target_player_id is not null;

create table if not exists public.web_push_subscription_matches (
  subscription_id uuid not null references public.web_push_subscriptions (id) on delete cascade,
  match_id uuid not null references public.matches (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (subscription_id, match_id)
);

create index if not exists idx_web_push_subscription_matches_match
  on public.web_push_subscription_matches (match_id);

alter table public.web_push_subscription_teams enable row level security;
alter table public.web_push_subscription_matches enable row level security;

revoke all on public.web_push_subscription_teams from anon, authenticated;
revoke all on public.web_push_subscription_matches from anon, authenticated;
grant select, delete on public.web_push_subscription_teams to authenticated;
grant select, delete on public.web_push_subscription_matches to authenticated;

drop policy if exists "web_push_subscription_teams_select_staff" on public.web_push_subscription_teams;
drop policy if exists "web_push_subscription_teams_delete_staff" on public.web_push_subscription_teams;
drop policy if exists "web_push_subscription_matches_select_staff" on public.web_push_subscription_matches;
drop policy if exists "web_push_subscription_matches_delete_staff" on public.web_push_subscription_matches;

create policy "web_push_subscription_teams_select_staff"
  on public.web_push_subscription_teams for select to authenticated
  using ((select private.is_staff()));

create policy "web_push_subscription_teams_delete_staff"
  on public.web_push_subscription_teams for delete to authenticated
  using ((select private.is_staff()));

create policy "web_push_subscription_matches_select_staff"
  on public.web_push_subscription_matches for select to authenticated
  using ((select private.is_staff()));

create policy "web_push_subscription_matches_delete_staff"
  on public.web_push_subscription_matches for delete to authenticated
  using ((select private.is_staff()));

-- Allow device rows without a legacy team_id (follows live in junctions).
alter table public.web_push_subscriptions
  alter column team_id drop not null;

-- Backfill team follows from legacy single-team device rows.
insert into public.web_push_subscription_teams (
  subscription_id,
  team_id,
  target_player_id,
  created_at,
  updated_at
)
select
  s.id,
  s.team_id,
  s.target_player_id,
  s.created_at,
  s.updated_at
from public.web_push_subscriptions s
where s.team_id is not null
on conflict (subscription_id, team_id) do update
set
  target_player_id = excluded.target_player_id,
  updated_at = excluded.updated_at;

-- ---------------------------------------------------------------------------
-- Upsert device + attach team follow (replaces single-team overwrite behavior)
-- ---------------------------------------------------------------------------

create or replace function public.subscribe_parent_web_push(
  p_team_id uuid,
  p_endpoint text,
  p_p256dh text,
  p_auth text,
  p_target_player_id uuid default null,
  p_user_agent text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_endpoint text := nullif(btrim(coalesce(p_endpoint, '')), '');
  v_p256dh text := nullif(btrim(coalesce(p_p256dh, '')), '');
  v_auth text := nullif(btrim(coalesce(p_auth, '')), '');
  v_ua text := nullif(left(btrim(coalesce(p_user_agent, '')), 400), '');
  v_sub_id uuid;
begin
  if p_team_id is null or v_endpoint is null or v_p256dh is null or v_auth is null then
    raise exception 'teamId and a valid PushSubscription are required';
  end if;

  if not exists (select 1 from public.teams t where t.id = p_team_id) then
    raise exception 'Team not found';
  end if;

  if p_target_player_id is not null and not exists (
    select 1 from public.players p where p.id = p_target_player_id
  ) then
    raise exception 'Player not found';
  end if;

  insert into public.web_push_subscriptions as s (
    endpoint,
    p256dh,
    auth,
    team_id,
    target_player_id,
    user_agent,
    updated_at
  )
  values (
    v_endpoint,
    v_p256dh,
    v_auth,
    p_team_id,
    p_target_player_id,
    v_ua,
    now()
  )
  on conflict (endpoint) do update
  set
    p256dh = excluded.p256dh,
    auth = excluded.auth,
    -- Keep a legacy team_id for older readers; junctions are source of truth.
    team_id = coalesce(s.team_id, excluded.team_id),
    target_player_id = excluded.target_player_id,
    user_agent = excluded.user_agent,
    updated_at = now()
  returning s.id into v_sub_id;

  insert into public.web_push_subscription_teams as st (
    subscription_id,
    team_id,
    target_player_id,
    updated_at
  )
  values (v_sub_id, p_team_id, p_target_player_id, now())
  on conflict (subscription_id, team_id) do update
  set
    target_player_id = excluded.target_player_id,
    updated_at = now();

  return jsonb_build_object('ok', true, 'subscriptionId', v_sub_id);
end;
$$;

revoke all on function public.subscribe_parent_web_push(uuid, text, text, text, uuid, text) from public;
grant execute on function public.subscribe_parent_web_push(uuid, text, text, text, uuid, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Single-game follow
-- ---------------------------------------------------------------------------

create or replace function public.subscribe_parent_web_push_match(
  p_match_id uuid,
  p_endpoint text,
  p_p256dh text,
  p_auth text,
  p_user_agent text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_endpoint text := nullif(btrim(coalesce(p_endpoint, '')), '');
  v_p256dh text := nullif(btrim(coalesce(p_p256dh, '')), '');
  v_auth text := nullif(btrim(coalesce(p_auth, '')), '');
  v_ua text := nullif(left(btrim(coalesce(p_user_agent, '')), 400), '');
  v_team_id uuid;
  v_sub_id uuid;
begin
  if p_match_id is null or v_endpoint is null or v_p256dh is null or v_auth is null then
    raise exception 'matchId and a valid PushSubscription are required';
  end if;

  select m.team_id into v_team_id
  from public.matches m
  where m.id = p_match_id
    and coalesce(m.is_test, false) = false;

  if v_team_id is null then
    raise exception 'Match not found';
  end if;

  insert into public.web_push_subscriptions as s (
    endpoint,
    p256dh,
    auth,
    team_id,
    user_agent,
    updated_at
  )
  values (
    v_endpoint,
    v_p256dh,
    v_auth,
    v_team_id,
    v_ua,
    now()
  )
  on conflict (endpoint) do update
  set
    p256dh = excluded.p256dh,
    auth = excluded.auth,
    team_id = coalesce(s.team_id, excluded.team_id),
    user_agent = excluded.user_agent,
    updated_at = now()
  returning s.id into v_sub_id;

  insert into public.web_push_subscription_matches as sm (
    subscription_id,
    match_id
  )
  values (v_sub_id, p_match_id)
  on conflict (subscription_id, match_id) do nothing;

  return jsonb_build_object('ok', true, 'subscriptionId', v_sub_id);
end;
$$;

revoke all on function public.subscribe_parent_web_push_match(uuid, text, text, text, text) from public;
grant execute on function public.subscribe_parent_web_push_match(uuid, text, text, text, text) to anon, authenticated;

create or replace function public.unsubscribe_parent_web_push_team(
  p_team_id uuid,
  p_endpoint text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_endpoint text := nullif(btrim(coalesce(p_endpoint, '')), '');
  v_sub_id uuid;
begin
  if p_team_id is null or v_endpoint is null then
    raise exception 'teamId and endpoint are required';
  end if;

  select s.id into v_sub_id
  from public.web_push_subscriptions s
  where s.endpoint = v_endpoint;

  if v_sub_id is null then
    return jsonb_build_object('ok', true, 'removed', false);
  end if;

  delete from public.web_push_subscription_teams st
  where st.subscription_id = v_sub_id
    and st.team_id = p_team_id;

  return jsonb_build_object('ok', true, 'removed', true);
end;
$$;

revoke all on function public.unsubscribe_parent_web_push_team(uuid, text) from public;
grant execute on function public.unsubscribe_parent_web_push_team(uuid, text) to anon, authenticated;

create or replace function public.unsubscribe_parent_web_push_match(
  p_match_id uuid,
  p_endpoint text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_endpoint text := nullif(btrim(coalesce(p_endpoint, '')), '');
  v_sub_id uuid;
begin
  if p_match_id is null or v_endpoint is null then
    raise exception 'matchId and endpoint are required';
  end if;

  select s.id into v_sub_id
  from public.web_push_subscriptions s
  where s.endpoint = v_endpoint;

  if v_sub_id is null then
    return jsonb_build_object('ok', true, 'removed', false);
  end if;

  delete from public.web_push_subscription_matches sm
  where sm.subscription_id = v_sub_id
    and sm.match_id = p_match_id;

  return jsonb_build_object('ok', true, 'removed', true);
end;
$$;

revoke all on function public.unsubscribe_parent_web_push_match(uuid, text) from public;
grant execute on function public.unsubscribe_parent_web_push_match(uuid, text) to anon, authenticated;

create or replace function public.list_parent_web_push_follows(p_endpoint text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_endpoint text := nullif(btrim(coalesce(p_endpoint, '')), '');
  v_sub_id uuid;
  v_teams jsonb;
  v_matches jsonb;
begin
  if v_endpoint is null then
    return jsonb_build_object('teamIds', '[]'::jsonb, 'matchIds', '[]'::jsonb);
  end if;

  select s.id into v_sub_id
  from public.web_push_subscriptions s
  where s.endpoint = v_endpoint;

  if v_sub_id is null then
    return jsonb_build_object('teamIds', '[]'::jsonb, 'matchIds', '[]'::jsonb);
  end if;

  select coalesce(jsonb_agg(st.team_id order by st.team_id), '[]'::jsonb)
  into v_teams
  from public.web_push_subscription_teams st
  where st.subscription_id = v_sub_id;

  select coalesce(jsonb_agg(sm.match_id order by sm.match_id), '[]'::jsonb)
  into v_matches
  from public.web_push_subscription_matches sm
  join public.matches m on m.id = sm.match_id
  where sm.subscription_id = v_sub_id
    and m.status not in ('final', 'cancelled');

  return jsonb_build_object(
    'teamIds', v_teams,
    'matchIds', v_matches
  );
end;
$$;

revoke all on function public.list_parent_web_push_follows(text) from public;
grant execute on function public.list_parent_web_push_follows(text) to anon, authenticated;

-- Recipients for a live alert: team followers ∪ match followers (deduped).
create or replace function public.get_web_push_recipients_for_alert(
  p_team_id uuid,
  p_match_id uuid default null,
  p_target_player_id uuid default null
)
returns table (
  id uuid,
  endpoint text,
  p256dh text,
  auth text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_team_id is null then
    return;
  end if;

  -- Staff match handlers only.
  if not (select private.is_staff()) then
    raise exception 'Not authorized';
  end if;

  return query
  select distinct s.id, s.endpoint, s.p256dh, s.auth
  from public.web_push_subscriptions s
  where exists (
      select 1
      from public.web_push_subscription_teams st
      where st.subscription_id = s.id
        and st.team_id = p_team_id
        and (
          p_target_player_id is null
          or st.target_player_id = p_target_player_id
        )
    )
    or (
      p_match_id is not null
      and p_target_player_id is null
      and exists (
        select 1
        from public.web_push_subscription_matches sm
        where sm.subscription_id = s.id
          and sm.match_id = p_match_id
      )
    )
    -- Legacy rows not yet backfilled into junctions.
    or (
      s.team_id = p_team_id
      and not exists (
        select 1
        from public.web_push_subscription_teams st
        where st.subscription_id = s.id
      )
      and (
        p_target_player_id is null
        or s.target_player_id = p_target_player_id
      )
    );
end;
$$;

revoke all on function public.get_web_push_recipients_for_alert(uuid, uuid, uuid) from public;
grant execute on function public.get_web_push_recipients_for_alert(uuid, uuid, uuid) to authenticated;

notify pgrst, 'reload schema';
