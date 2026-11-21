-- Rebuild playing minutes for Blitz vs SOCA (2026-11-21) from the event
-- timeline. Second-half substitutes kept only their open second-half stint;
-- first-half totals were dropped at finalization/sync.

-- Blitz vs SOCA 2015/2016 blue (b2843fb3-22f9-4786-ad44-b91811a70256)
update public.match_stats set total_seconds_played = 3089, total_minutes = 3089 / 60.0, is_second_half_starter = false
where match_id = 'b2843fb3-22f9-4786-ad44-b91811a70256' and player_id = '2b1dbfdf-6cfe-41f8-91f0-a03cd04d5d57';
update public.match_stats set total_seconds_played = 2692, total_minutes = 2692 / 60.0, is_second_half_starter = false
where match_id = 'b2843fb3-22f9-4786-ad44-b91811a70256' and player_id = '6d3fd177-ebc9-4591-b5a8-bcef4785ad36';

-- Second-half starters (minutes already correct; flags were left false).
update public.match_stats set is_second_half_starter = true
where match_id = 'b2843fb3-22f9-4786-ad44-b91811a70256'
  and player_id in (
    '565f8a6a-2526-48f7-afe3-6779ee6a321a',
    '4509296b-92df-4f75-8846-d334f25bef4f',
    '21aa15d1-9c6c-4f09-b9fe-8b8fc4619f85',
    '8aeea21c-32a0-4a0b-9368-1de0a4eaee6d',
    'd58562cf-a251-4410-bd76-361e1a03a082',
    '8e465bb4-bc32-43e8-8918-3f412061e5f4',
    'de5a71ff-83c3-4afc-8e1a-e0ec28ae5dae',
    'cc830122-c9df-4593-be48-34d2e7dfc418',
    '66d35d89-f26d-42a5-9e4a-d42398a9117c'
  );
