-- Staff last-seen for the Activity screen. Separate from audit_logs so opening
-- the app can refresh recency without flooding the event log.
-- Safe to re-run.

create table if not exists public.staff_last_seen (
  user_id uuid primary key references auth.users (id) on delete cascade,
  last_seen_at timestamptz not null default now(),
  last_action text not null,
  email text,
  club_id uuid references public.clubs (id) on delete set null,
  constraint staff_last_seen_last_action_nonempty check (length(trim(last_action)) > 0)
);

create index if not exists staff_last_seen_last_seen_at_idx
  on public.staff_last_seen (last_seen_at desc);

create index if not exists staff_last_seen_club_id_idx
  on public.staff_last_seen (club_id);

alter table public.staff_last_seen enable row level security;
alter table public.staff_last_seen force row level security;

revoke all on public.staff_last_seen from anon, authenticated;
grant select on public.staff_last_seen to authenticated;

drop policy if exists "staff_last_seen_select_system_admin" on public.staff_last_seen;
create policy "staff_last_seen_select_system_admin"
  on public.staff_last_seen for select to authenticated
  using ((select private.is_system_admin()));

create or replace function public.touch_staff_last_seen(
  p_action_type text default 'app_opened',
  p_club_id uuid default null,
  p_email text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := (select auth.uid());
  v_action text := coalesce(nullif(trim(coalesce(p_action_type, '')), ''), 'app_opened');
  v_email text := nullif(trim(coalesce(p_email, '')), '');
begin
  if v_uid is null then
    raise exception 'Not authenticated'
      using errcode = '42501';
  end if;

  insert into public.staff_last_seen (
    user_id,
    last_seen_at,
    last_action,
    email,
    club_id
  )
  values (
    v_uid,
    now(),
    v_action,
    v_email,
    p_club_id
  )
  on conflict (user_id) do update set
    last_seen_at = excluded.last_seen_at,
    last_action = excluded.last_action,
    email = coalesce(excluded.email, public.staff_last_seen.email),
    club_id = coalesce(excluded.club_id, public.staff_last_seen.club_id);
end;
$$;

revoke all on function public.touch_staff_last_seen(text, uuid, text) from public;
grant execute on function public.touch_staff_last_seen(text, uuid, text) to authenticated;

comment on function public.touch_staff_last_seen(text, uuid, text) is
  'Authenticated staff upsert their own last-seen row. Identity comes from auth.uid().';

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
  v_email text := nullif(trim(coalesce(p_metadata->>'email', '')), '');
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

  insert into public.staff_last_seen (
    user_id,
    last_seen_at,
    last_action,
    email,
    club_id
  )
  values (
    v_uid,
    now(),
    v_action,
    v_email,
    p_club_id
  )
  on conflict (user_id) do update set
    last_seen_at = excluded.last_seen_at,
    last_action = excluded.last_action,
    email = coalesce(excluded.email, public.staff_last_seen.email),
    club_id = coalesce(excluded.club_id, public.staff_last_seen.club_id);

  return v_id;
end;
$$;

revoke all on function public.log_system_activity(text, uuid, uuid, jsonb) from public;
grant execute on function public.log_system_activity(text, uuid, uuid, jsonb) to authenticated;

insert into public.staff_last_seen (user_id, last_seen_at, last_action, email, club_id)
select
  latest.user_id,
  latest.created_at,
  latest.action_type,
  emails.email,
  latest.club_id
from (
  select distinct on (user_id)
    user_id,
    created_at,
    action_type,
    club_id
  from public.audit_logs
  where user_id is not null
  order by user_id, created_at desc
) latest
left join (
  select distinct on (user_id)
    user_id,
    nullif(trim(metadata->>'email'), '') as email
  from public.audit_logs
  where user_id is not null
    and nullif(trim(metadata->>'email'), '') is not null
  order by user_id, created_at desc
) emails on emails.user_id = latest.user_id
on conflict (user_id) do nothing;

notify pgrst, 'reload schema';
