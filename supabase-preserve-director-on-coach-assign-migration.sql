-- Preserve club-level director when assigning coaching roles on teams.
--
-- Club role (user_roles.role) and team membership (team_members.role) are separate:
-- directors may also be head_coach / assistant_coach on specific teams.
-- Inviting or re-applying coach/assistant access must not demote directors.

create or replace function private.apply_staff_access(
  p_user_id uuid,
  p_role public.staff_role,
  p_team_ids uuid[],
  p_display_name text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_team_id uuid;
  v_member_role public.staff_role;
begin
  if p_role not in ('director', 'head_coach', 'assistant_coach') then
    raise exception 'Invalid staff role';
  end if;

  insert into public.user_roles (user_id, role, display_name)
  values (p_user_id, p_role, nullif(trim(coalesce(p_display_name, '')), ''))
  on conflict (user_id) do update
    set role = case
          when public.user_roles.role = 'director'::public.staff_role
           and excluded.role in (
             'head_coach'::public.staff_role,
             'assistant_coach'::public.staff_role
           )
          then public.user_roles.role
          else excluded.role
        end,
        display_name = coalesce(excluded.display_name, public.user_roles.display_name),
        updated_at = now();

  update public.profiles
  set
    display_name = coalesce(nullif(trim(coalesce(p_display_name, '')), ''), display_name),
    updated_at = now()
  where id = p_user_id;

  delete from public.team_members where user_id = p_user_id;

  -- Team membership role follows the coaching assignment, not club director.
  v_member_role := case
    when p_role = 'director' then 'head_coach'::public.staff_role
    else p_role
  end;

  if p_team_ids is not null then
    foreach v_team_id in array p_team_ids
    loop
      if exists (select 1 from public.teams t where t.id = v_team_id) then
        insert into public.team_members (user_id, team_id, role)
        values (p_user_id, v_team_id, v_member_role)
        on conflict (user_id, team_id) do update
          set role = excluded.role;
      end if;
    end loop;
  end if;
end;
$$;

revoke all on function private.apply_staff_access(uuid, public.staff_role, uuid[], text) from public;

-- One-off repair for the known demotion case (safe if already director).
update public.user_roles ur
set
  role = 'director',
  updated_at = now()
from public.profiles p
where p.id = ur.user_id
  and lower(p.email) = 'rossgilmore@gmail.com'
  and ur.role is distinct from 'director'::public.staff_role;
