-- Post-game player evaluations: switch match_reviews from -1/0/1 impact to 1–5 rating.

alter table public.match_reviews
  drop constraint if exists match_reviews_impact_score_check;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'match_reviews'
      and column_name = 'impact_score'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'match_reviews'
      and column_name = 'rating'
  ) then
    alter table public.match_reviews rename column impact_score to rating;
  end if;
end $$;

alter table public.match_reviews
  add column if not exists rating integer;

-- Legacy -1/0/1 → 2/3/5 on the 1–5 scale
update public.match_reviews
set rating = case
  when rating <= -1 then 2
  when rating = 0 then 3
  when rating = 1 then 5
  when rating between 1 and 5 then rating
  else 3
end
where rating is null
   or rating < 1
   or rating > 5;

alter table public.match_reviews
  alter column rating set default 3;

alter table public.match_reviews
  alter column rating set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'match_reviews_rating_check'
      and conrelid = 'public.match_reviews'::regclass
  ) then
    alter table public.match_reviews
      add constraint match_reviews_rating_check
      check (rating between 1 and 5);
  end if;
end $$;
