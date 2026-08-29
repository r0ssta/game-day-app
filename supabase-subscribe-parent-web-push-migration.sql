-- Public Parent Hub: persist Web Push subscriptions without an Edge Function admin key.
-- Callable by anon (parents) and authenticated roles.

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
begin
  if p_team_id is null or v_endpoint is null or v_p256dh is null or v_auth is null then
    raise exception 'teamId and a valid PushSubscription are required';
  end if;

  if not exists (
    select 1 from public.teams t where t.id = p_team_id
  ) then
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
    team_id = excluded.team_id,
    target_player_id = excluded.target_player_id,
    user_agent = excluded.user_agent,
    updated_at = now();

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.subscribe_parent_web_push(uuid, text, text, text, uuid, text) from public;
grant execute on function public.subscribe_parent_web_push(uuid, text, text, text, uuid, text) to anon, authenticated;

notify pgrst, 'reload schema';
