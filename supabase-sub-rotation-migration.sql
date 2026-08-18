-- Sub rotation assistant fields on matches + ensure attendance history via match_stats.attending.

alter table public.matches
  add column if not exists sub_interval_seconds integer
    check (sub_interval_seconds is null or sub_interval_seconds > 0);

alter table public.matches
  add column if not exists gk_plays_full_half boolean not null default true;
