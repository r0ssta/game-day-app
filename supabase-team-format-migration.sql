-- Team match format (7v7, 9v9, 11v11)

alter table public.teams
  add column if not exists format text not null default '9v9';

alter table public.teams
  drop constraint if exists teams_format_check;

alter table public.teams
  add constraint teams_format_check
  check (format in ('7v7', '9v9', '11v11'));
