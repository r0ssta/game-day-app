-- Add staff_role.pending in its own transaction.
-- Postgres forbids using a newly added enum value in the same transaction
-- that created it, so this file must stay separate from migrations that
-- insert/default to 'pending'.

do $$
begin
  if not exists (
    select 1
    from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public'
      and t.typname = 'staff_role'
      and e.enumlabel = 'pending'
  ) then
    alter type public.staff_role add value 'pending';
  end if;
exception
  when undefined_object then
    create type public.staff_role as enum (
      'director',
      'head_coach',
      'assistant_coach',
      'pending'
    );
end $$;
