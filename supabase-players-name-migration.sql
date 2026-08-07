-- Split player name into first_name / last_name; remove contact field

alter table public.players
  add column if not exists first_name text;

alter table public.players
  add column if not exists last_name text;

update public.players
set
  first_name = case
    when first_name is not null and trim(first_name) <> '' then trim(first_name)
    when position(' ' in trim(name)) > 0 then trim(split_part(trim(name), ' ', 1))
    else trim(name)
  end,
  last_name = case
    when last_name is not null and trim(last_name) <> '' then trim(last_name)
    when position(' ' in trim(name)) > 0 then trim(substring(trim(name) from position(' ' in trim(name)) + 1))
    else ''
  end
where name is not null;

update public.players
set first_name = coalesce(nullif(trim(first_name), ''), 'Player')
where first_name is null or trim(first_name) = '';

update public.players
set last_name = coalesce(last_name, '')
where last_name is null;

alter table public.players
  alter column first_name set not null;

alter table public.players
  alter column last_name set not null;

alter table public.players
  alter column last_name set default '';

alter table public.players
  drop column if exists name;

alter table public.players
  drop column if exists contact_info;
