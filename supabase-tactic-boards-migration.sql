-- Free-form tactic boards. canvas_json is the Konva stage from stage.toJSON().
-- Safe to re-run.

create table if not exists public.tactic_boards (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  match_id uuid references public.matches (id) on delete cascade,
  phase text not null,
  canvas_json jsonb not null,
  created_at timestamptz not null default now(),
  constraint tactic_boards_phase_check check (phase in ('pregame', 'live', 'halftime'))
);

comment on table public.tactic_boards is
  'Coach tactic sketches. canvas_json is a Konva stage document.';

comment on column public.tactic_boards.canvas_json is
  'JSON object produced by stage.toJSON(), stored as jsonb.';

create index if not exists idx_tactic_boards_team_created
  on public.tactic_boards (team_id, created_at desc);

create index if not exists idx_tactic_boards_match_id
  on public.tactic_boards (match_id);

alter table public.tactic_boards enable row level security;

grant select, insert, update, delete on public.tactic_boards to authenticated;

drop policy if exists "tactic_boards_select_staff" on public.tactic_boards;
drop policy if exists "tactic_boards_insert_staff" on public.tactic_boards;
drop policy if exists "tactic_boards_update_staff" on public.tactic_boards;
drop policy if exists "tactic_boards_delete_staff" on public.tactic_boards;

create policy "tactic_boards_select_staff"
  on public.tactic_boards for select to authenticated
  using ((select private.is_staff()) and (select private.has_team_access(team_id)));

create policy "tactic_boards_insert_staff"
  on public.tactic_boards for insert to authenticated
  with check (
    (select private.is_staff())
    and (select private.has_team_access(team_id))
    and (
      match_id is null
      or exists (
        select 1
        from public.matches m
        where m.id = match_id
          and m.team_id = tactic_boards.team_id
      )
    )
  );

create policy "tactic_boards_update_staff"
  on public.tactic_boards for update to authenticated
  using ((select private.is_staff()) and (select private.has_team_access(team_id)))
  with check (
    (select private.is_staff())
    and (select private.has_team_access(team_id))
    and (
      match_id is null
      or exists (
        select 1
        from public.matches m
        where m.id = match_id
          and m.team_id = tactic_boards.team_id
      )
    )
  );

create policy "tactic_boards_delete_staff"
  on public.tactic_boards for delete to authenticated
  using (
    (select private.can_manage_destructive())
    and (select private.has_team_access(team_id))
  );
