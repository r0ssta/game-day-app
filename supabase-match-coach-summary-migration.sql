-- Coach executive summary on completed matches

alter table public.matches
  add column if not exists coach_summary_notes text;
