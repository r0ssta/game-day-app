-- Saved formation shapes per team. Safe to re-run.

create table if not exists public.team_formations (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  name text not null,
  format text not null,
  slots jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint team_formations_format_check check (format in ('7v7', '9v9', '11v11')),
  constraint team_formations_name_len check (char_length(btrim(name)) between 1 and 40),
  constraint team_formations_slots_array check (jsonb_typeof(slots) = 'array'),
  constraint team_formations_team_format_name_key unique (team_id, format, name)
);

comment on table public.team_formations is
  'Coach-saved pitch shapes. slots is a jsonb array of {id, role, label, x, y}.';

create index if not exists idx_team_formations_team_format
  on public.team_formations (team_id, format);

alter table public.team_formations enable row level security;

grant select, insert, update, delete on public.team_formations to authenticated;

drop policy if exists "team_formations_select_staff" on public.team_formations;
drop policy if exists "team_formations_insert_staff" on public.team_formations;
drop policy if exists "team_formations_update_staff" on public.team_formations;
drop policy if exists "team_formations_delete_staff" on public.team_formations;

create policy "team_formations_select_staff"
  on public.team_formations for select to authenticated
  using ((select private.is_staff()) and (select private.has_team_access(team_id)));

create policy "team_formations_insert_staff"
  on public.team_formations for insert to authenticated
  with check ((select private.is_staff()) and (select private.has_team_access(team_id)));

create policy "team_formations_update_staff"
  on public.team_formations for update to authenticated
  using ((select private.is_staff()) and (select private.has_team_access(team_id)))
  with check ((select private.is_staff()) and (select private.has_team_access(team_id)));

create policy "team_formations_delete_staff"
  on public.team_formations for delete to authenticated
  using ((select private.is_staff()) and (select private.has_team_access(team_id)));
