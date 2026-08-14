-- Age groups on teams (Virginia Velocity lineup defaults)

alter table public.teams
  add column if not exists age_group text;

alter table public.teams
  drop constraint if exists teams_age_group_check;

alter table public.teams
  add constraint teams_age_group_check
  check (
    age_group is null
    or age_group in ('U9', 'U10', 'U11', 'U12', 'U13', 'U14', 'U15', 'U16')
  );

create index if not exists idx_teams_age_group on public.teams (age_group);

-- Best-effort backfill from team name patterns like "U13" / "u11"
update public.teams t
set age_group = 'U' || upper(m[1])
from (
  select
    id,
    regexp_match(name, '(?i)\bu(9|10|11|12|13|14|15|16)\b') as m
  from public.teams
) matched
where t.id = matched.id
  and t.age_group is null
  and matched.m is not null;

-- Align format with age group when we could infer one
update public.teams
set format = case
  when age_group in ('U9', 'U10') then '7v7'
  when age_group in ('U11', 'U12') then '9v9'
  when age_group in ('U13', 'U14', 'U15', 'U16') then '11v11'
  else format
end
where age_group is not null;

notify pgrst, 'reload schema';
