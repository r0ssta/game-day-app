-- U13 Maroon vs Soca (2026-09-05) kicked off with the countdown already at 0:00.
-- First-half event timestamps were written as ~30 minutes + real elapsed (~55:00
-- at the whistle of a 25-minute half). Rebase those timestamps and record the
-- actual 25-minute tournament length.

update public.match_events
set timestamp = greatest(0, timestamp - 1800)
where match_id = 'ec9bb310-f2af-4830-b1fa-d426fac9cc0d'
  and created_at < '2026-09-06 13:02:00+00'
  and timestamp >= 1800;

update public.matches
set
  half_length = 25,
  period_length = 25,
  tournament_game = true
where id = 'ec9bb310-f2af-4830-b1fa-d426fac9cc0d'
  and half_length = 30;
