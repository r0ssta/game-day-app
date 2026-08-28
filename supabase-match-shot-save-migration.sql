-- Live match team shot / save events (Home = us, Away = opponent).

alter table public.match_events
  drop constraint if exists match_events_event_type_check;

alter table public.match_events
  add constraint match_events_event_type_check
  check (event_type in (
    'goal',
    'assist',
    'sub_in',
    'sub_out',
    'position_change',
    'opponent_goal',
    'formation_change',
    'stat_shot_on_target',
    'stat_shot_off_target',
    'stat_goal',
    'stat_assist',
    'stat_dribble',
    'stat_tackle',
    'stat_save',
    'stat_pass',
    'stat_key_pass',
    'stat_team_log',
    'pk_attempt',
    'yellow_card',
    'red_card',
    'shot_home',
    'shot_away',
    'save_home',
    'save_away'
  ));

alter table public.match_events
  drop constraint if exists match_events_player_required_check;

alter table public.match_events
  add constraint match_events_player_required_check
  check (
    event_type in (
      'opponent_goal',
      'formation_change',
      'stat_team_log',
      'pk_attempt',
      'shot_home',
      'shot_away',
      'save_home',
      'save_away'
    )
    or player_id is not null
  );
