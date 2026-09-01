-- Staff live screens need match row + lineup stats, not only match_events.
-- duplicate_object is safe when a table is already in the publication.

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime add table public.matches;
    exception
      when duplicate_object then null;
    end;
    begin
      alter publication supabase_realtime add table public.match_stats;
    exception
      when duplicate_object then null;
    end;
  end if;
end $$;
