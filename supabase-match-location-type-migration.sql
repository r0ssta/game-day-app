-- Home / Away venue type for matches (replaces free-text location input)

alter table public.matches
  add column if not exists location_type text not null default 'home';

alter table public.matches
  drop constraint if exists matches_location_type_check;

alter table public.matches
  add constraint matches_location_type_check
  check (location_type in ('home', 'away'));

-- Legacy rows: treat old free-text location values as home unless explicitly away
update public.matches
set location_type = 'away'
where lower(trim(coalesce(location, ''))) = 'away';

update public.matches
set location_type = 'home'
where location_type is null or trim(location_type) = '';
