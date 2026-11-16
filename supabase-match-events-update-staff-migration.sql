-- Allow authenticated staff with match access to update match_events
-- (needed for correcting goal scorer / assist / minute).
-- Previously only SELECT / INSERT / DELETE policies existed; UPDATEs
-- silently affected 0 rows under RLS.

drop policy if exists "match_events_update_staff" on public.match_events;

create policy "match_events_update_staff"
  on public.match_events for update to authenticated
  using ((select private.is_staff()) and (select private.has_match_access(match_id)))
  with check ((select private.is_staff()) and (select private.has_match_access(match_id)));
