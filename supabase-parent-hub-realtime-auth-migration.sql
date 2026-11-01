-- Parent Hub Realtime uses the browser JWT role. Parent select policies were
-- TO anon only, so an authenticated non-staff session on /hub could SUBSCRIBE
-- successfully while every postgres_changes payload was filtered out.
-- Keep the same public in-progress predicates for authenticated viewers.

drop policy if exists "matches_select_parent_in_progress" on public.matches;
create policy "matches_select_parent_in_progress"
  on public.matches for select to anon, authenticated
  using (
    status in (
      'live',
      'extra_time_first_half',
      'extra_time_second_half',
      'penalty_shootout'
    )
    and coalesce(is_test, false) = false
    and exists (
      select 1
      from public.teams t
      where t.id = matches.team_id
        and t.active_status is distinct from false
    )
  );

drop policy if exists "match_events_select_parent_live" on public.match_events;
create policy "match_events_select_parent_live"
  on public.match_events for select to anon, authenticated
  using (
    exists (
      select 1
      from public.matches m
      join public.teams t on t.id = m.team_id
      where m.id = match_events.match_id
        and m.status in (
          'live',
          'extra_time_first_half',
          'extra_time_second_half',
          'penalty_shootout'
        )
        and coalesce(m.is_test, false) = false
        and t.active_status is distinct from false
        and match_events.event_type in (
          'goal',
          'opponent_goal',
          'yellow_card',
          'red_card',
          'sub_in',
          'sub_out',
          'position_change',
          'shot_home',
          'shot_away',
          'save_home',
          'save_away',
          'corner_home',
          'corner_away',
          'pk_attempt'
        )
    )
  );
