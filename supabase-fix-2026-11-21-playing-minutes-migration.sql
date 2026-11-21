-- Rebuild playing minutes for completed 2026-11-21 matches from the event
-- timeline. End-of-period finalize skipped open stints for unstamped on-field
-- players who already had prior-period totals, so match_stats kept first-half
-- (or 0) instead of full-game minutes.

-- Blitz vs Virginia Legacy (63bbeed5-4fed-4c63-a6c9-af221d9d4a56)
update public.match_stats set total_seconds_played = 3514, total_minutes = 3514 / 60.0, is_second_half_starter = true
where match_id = '63bbeed5-4fed-4c63-a6c9-af221d9d4a56' and player_id = '4509296b-92df-4f75-8846-d334f25bef4f';
update public.match_stats set total_seconds_played = 3345, total_minutes = 3345 / 60.0, is_second_half_starter = true
where match_id = '63bbeed5-4fed-4c63-a6c9-af221d9d4a56' and player_id = '2b1dbfdf-6cfe-41f8-91f0-a03cd04d5d57';
update public.match_stats set total_seconds_played = 3178, total_minutes = 3178 / 60.0, is_second_half_starter = true
where match_id = '63bbeed5-4fed-4c63-a6c9-af221d9d4a56' and player_id = '8aeea21c-32a0-4a0b-9368-1de0a4eaee6d';
update public.match_stats set total_seconds_played = 2984, total_minutes = 2984 / 60.0, is_second_half_starter = true
where match_id = '63bbeed5-4fed-4c63-a6c9-af221d9d4a56' and player_id = 'cc830122-c9df-4593-be48-34d2e7dfc418';
update public.match_stats set total_seconds_played = 2956, total_minutes = 2956 / 60.0, is_second_half_starter = true
where match_id = '63bbeed5-4fed-4c63-a6c9-af221d9d4a56' and player_id = 'd58562cf-a251-4410-bd76-361e1a03a082';
update public.match_stats set total_seconds_played = 2944, total_minutes = 2944 / 60.0, is_second_half_starter = true
where match_id = '63bbeed5-4fed-4c63-a6c9-af221d9d4a56' and player_id = 'dc194afc-754c-4fc4-a60e-109b541a234b';
update public.match_stats set total_seconds_played = 2854, total_minutes = 2854 / 60.0, is_second_half_starter = true
where match_id = '63bbeed5-4fed-4c63-a6c9-af221d9d4a56' and player_id = 'de5a71ff-83c3-4afc-8e1a-e0ec28ae5dae';
update public.match_stats set total_seconds_played = 2807, total_minutes = 2807 / 60.0, is_second_half_starter = false
where match_id = '63bbeed5-4fed-4c63-a6c9-af221d9d4a56' and player_id = '565f8a6a-2526-48f7-afe3-6779ee6a321a';
update public.match_stats set total_seconds_played = 2743, total_minutes = 2743 / 60.0, is_second_half_starter = true
where match_id = '63bbeed5-4fed-4c63-a6c9-af221d9d4a56' and player_id = '21aa15d1-9c6c-4f09-b9fe-8b8fc4619f85';
update public.match_stats set total_seconds_played = 2726, total_minutes = 2726 / 60.0, is_second_half_starter = true
where match_id = '63bbeed5-4fed-4c63-a6c9-af221d9d4a56' and player_id = '6d3fd177-ebc9-4591-b5a8-bcef4785ad36';
-- Bench for second half — already correct first-half totals; keep flags explicit.
update public.match_stats set total_seconds_played = 1289, total_minutes = 1289 / 60.0, is_second_half_starter = false
where match_id = '63bbeed5-4fed-4c63-a6c9-af221d9d4a56' and player_id = '66d35d89-f26d-42a5-9e4a-d42398a9117c';
update public.match_stats set total_seconds_played = 1258, total_minutes = 1258 / 60.0, is_second_half_starter = false
where match_id = '63bbeed5-4fed-4c63-a6c9-af221d9d4a56' and player_id = '8e465bb4-bc32-43e8-8918-3f412061e5f4';

-- Flare vs Fury FC (4e1ca9b7-123a-4e2a-819e-a06dbf440762)
-- Oliver Radke lost periods 2+ the same way; ignore the accidental 3-second "3rd period".
update public.match_stats set total_seconds_played = 2517, total_minutes = 2517 / 60.0
where match_id = '4e1ca9b7-123a-4e2a-819e-a06dbf440762' and player_id = '0bb6bd11-ef94-4a81-9f7b-128f92bd60c3';
