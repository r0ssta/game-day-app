-- Optional qualitative context on post-game recaps (gut check, opponent tier, focus chips, etc.)

alter table public.matches
  add column if not exists qualitative_context jsonb;
