-- Super-admin audit log: system_admins + audit_logs + log_system_activity RPC.
-- Safe to re-run.

create table if not exists public.system_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  club_id uuid references public.clubs (id) on delete set null,
  team_id uuid references public.teams (id) on delete set null,
  action_type text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint audit_logs_action_type_nonempty check (length(trim(action_type)) > 0)
);

create index if not exists idx_audit_logs_created_at
  on public.audit_logs (created_at desc);

create index if not exists idx_audit_logs_user_id
  on public.audit_logs (user_id);

create index if not exists idx_audit_logs_club_id
  on public.audit_logs (club_id);

create index if not exists idx_audit_logs_team_id
  on public.audit_logs (team_id);

create index if not exists idx_audit_logs_action_type
  on public.audit_logs (action_type);

alter table public.system_admins enable row level security;
alter table public.audit_logs enable row level security;

revoke all on public.system_admins from anon, authenticated;
revoke all on public.audit_logs from anon, authenticated;

-- Read-only Data API access. INSERT/UPDATE/DELETE stay revoked so clients
-- cannot spoof audit rows or self-promote. Writes go through log_system_activity.
grant select on public.system_admins to authenticated;
grant select on public.audit_logs to authenticated;

-- Seed from existing platform admins (Ross). Do not auto-join anyone else.
insert into public.system_admins (user_id)
select pa.user_id
from public.platform_admins pa
on conflict (user_id) do nothing;

create or replace function private.is_system_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.system_admins sa
    where sa.user_id = (select auth.uid())
  );
$$;

revoke all on function private.is_system_admin() from public;
grant execute on function private.is_system_admin() to authenticated;

drop policy if exists "system_admins_select_own" on public.system_admins;
create policy "system_admins_select_own"
  on public.system_admins for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "audit_logs_select_system_admin" on public.audit_logs;
create policy "audit_logs_select_system_admin"
  on public.audit_logs for select to authenticated
  using ((select private.is_system_admin()));

create or replace function public.log_system_activity(
  p_action_type text,
  p_club_id uuid default null,
  p_team_id uuid default null,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := (select auth.uid());
  v_action text := nullif(trim(coalesce(p_action_type, '')), '');
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'Not authenticated'
      using errcode = '42501';
  end if;

  if v_action is null then
    raise exception 'action_type is required'
      using errcode = '22023';
  end if;

  insert into public.audit_logs (
    user_id,
    club_id,
    team_id,
    action_type,
    metadata
  )
  values (
    v_uid,
    p_club_id,
    p_team_id,
    v_action,
    coalesce(p_metadata, '{}'::jsonb)
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.log_system_activity(text, uuid, uuid, jsonb) from public;
grant execute on function public.log_system_activity(text, uuid, uuid, jsonb) to authenticated;

notify pgrst, 'reload schema';
