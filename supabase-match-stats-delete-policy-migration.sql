-- Staff can replace a scheduled lineup. Without DELETE, RLS drops 0 rows and
-- the following insert hits match_stats_match_id_player_id_key.

drop policy if exists "match_stats_delete_staff" on public.match_stats;

create policy "match_stats_delete_staff"
  on public.match_stats
  for delete
  to authenticated
  using (
    (select private.is_staff())
    and (select private.has_match_access(match_id))
  );
