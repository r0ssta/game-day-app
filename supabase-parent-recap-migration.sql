-- Parent-facing weekly recap fields on matches.
-- Renames coach_summary_notes → internal_coach_notes (staff-only notes)
-- and adds parent_facing_recap for email-safe game summaries.

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'matches'
      and column_name = 'coach_summary_notes'
  )
  and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'matches'
      and column_name = 'internal_coach_notes'
  ) then
    alter table public.matches
      rename column coach_summary_notes to internal_coach_notes;
  end if;
end $$;

alter table public.matches
  add column if not exists internal_coach_notes text;

alter table public.matches
  add column if not exists parent_facing_recap text;

-- If both columns existed somehow (partial migrate), prefer keeping internal and drop legacy.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'matches'
      and column_name = 'coach_summary_notes'
  )
  and exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'matches'
      and column_name = 'internal_coach_notes'
  ) then
    update public.matches
    set internal_coach_notes = coalesce(internal_coach_notes, coach_summary_notes)
    where coach_summary_notes is not null;

    alter table public.matches
      drop column coach_summary_notes;
  end if;
end $$;
