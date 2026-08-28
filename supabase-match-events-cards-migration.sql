-- Yellow/red card events + per-player sent-off flag on match_stats.
-- Safe to re-run.

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
    'red_card'
  ));

alter table public.match_stats
  add column if not exists is_sent_off boolean not null default false;

comment on column public.match_stats.is_sent_off is
  'True when the player received a red card (straight or second yellow) and cannot return.';
