-- Directors only: change team name / age group / format.
-- Other staff may still update non-profile fields (e.g. primary_coach_name).

create or replace function private.enforce_team_profile_director()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE'
     and (
       new.name is distinct from old.name
       or new.age_group is distinct from old.age_group
       or new.format is distinct from old.format
     )
     and not private.is_director() then
    raise exception 'Only club directors can change team name, age group, or format'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_teams_profile_director on public.teams;
create trigger trg_teams_profile_director
  before update on public.teams
  for each row
  execute function private.enforce_team_profile_director();

-- Keep insert director-only (idempotent rename for clarity)
drop policy if exists "teams_insert_staff" on public.teams;
drop policy if exists "teams_insert_director" on public.teams;
create policy "teams_insert_director"
  on public.teams for insert to authenticated
  with check ((select private.is_director()));

notify pgrst, 'reload schema';
