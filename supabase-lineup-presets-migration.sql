-- Saved lineup presets per team

create table if not exists public.lineup_presets (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  preset_name text not null,
  formation_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (team_id, preset_name)
);

create index if not exists idx_lineup_presets_team_id on public.lineup_presets (team_id);

alter table public.lineup_presets enable row level security;

create policy "lineup_presets_select_all" on public.lineup_presets for select to anon, authenticated using (true);
create policy "lineup_presets_insert_all" on public.lineup_presets for insert to anon, authenticated with check (true);
create policy "lineup_presets_update_all" on public.lineup_presets for update to anon, authenticated using (true) with check (true);
create policy "lineup_presets_delete_all" on public.lineup_presets for delete to anon, authenticated using (true);
