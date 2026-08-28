-- Ensure assist_player_id exists and Parent Hub live-event RPC can hydrate.

alter table public.match_events
  add column if not exists assist_player_id uuid references public.players (id) on delete set null;

create index if not exists idx_match_events_assist_player_id
  on public.match_events (assist_player_id);

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
