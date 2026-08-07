-- Optional contact info on roster players

alter table public.players
  add column if not exists contact_info text;
