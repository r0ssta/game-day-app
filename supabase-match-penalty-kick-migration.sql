-- Penalty kick shootouts for tournament elimination games.
-- Safe to re-run.

alter table public.matches
  add column if not exists goes_to_pks boolean not null default false;

alter table public.matches
  add column if not exists home_pk_score integer not null default 0;

alter table public.matches
  add column if not exists away_pk_score integer not null default 0;

alter table public.matches
  add column if not exists pk_winner_is_us boolean;

alter table public.matches
  drop constraint if exists matches_home_pk_score_check;

alter table public.matches
  add constraint matches_home_pk_score_check
  check (home_pk_score >= 0);

alter table public.matches
  drop constraint if exists matches_away_pk_score_check;

alter table public.matches
  add constraint matches_away_pk_score_check
  check (away_pk_score >= 0);

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
    'pk_attempt'
  ));

alter table public.match_events
  drop constraint if exists match_events_player_required_check;

alter table public.match_events
  add constraint match_events_player_required_check
  check (
    event_type in ('opponent_goal', 'formation_change', 'stat_team_log', 'pk_attempt')
    or player_id is not null
  );

-- Structured PK attempt fields (nullable for non-PK events).
alter table public.match_events
  add column if not exists pk_result text;

alter table public.match_events
  add column if not exists pk_team text;

alter table public.match_events
  drop constraint if exists match_events_pk_result_check;

alter table public.match_events
  add constraint match_events_pk_result_check
  check (pk_result is null or pk_result in ('make', 'miss'));

alter table public.match_events
  drop constraint if exists match_events_pk_team_check;

alter table public.match_events
  add constraint match_events_pk_team_check
  check (pk_team is null or pk_team in ('us', 'opponent'));

alter table public.match_events
  drop constraint if exists match_events_pk_attempt_fields_check;

alter table public.match_events
  add constraint match_events_pk_attempt_fields_check
  check (
    event_type <> 'pk_attempt'
    or (
      pk_result is not null
      and pk_team is not null
      and (pk_team = 'opponent' or player_id is not null)
    )
  );
