export type DbTeam = {
  id: string
  name: string
  format: string
  age_group?: string | null
  primary_coach_name?: string
  /** false = archived; keep history, hide from selectors */
  active_status: boolean
  created_at: string
}

export type DbCoach = {
  id: string
  name: string
  created_at: string
}

export type DbPlayer = {
  id: string
  first_name: string
  last_name: string
  /** Club pool jersey hint — season_rosters.primary_jersey_number is authoritative per team/season. */
  jersey: number | null
  age_group: string
  active_status: boolean
  /** @deprecated Prefer match_stats.is_match_guest for match-day guests. */
  is_guest: boolean
  position: string
  primary_position: string | null
  secondary_position: string | null
  created_at: string
  /** @deprecated Legacy column — may exist before name migration */
  name?: string
}

export type SeasonStatus = 'active' | 'archived'

export type DbSeason = {
  id: string
  name: string
  status: SeasonStatus
  /** First day of start month (YYYY-MM-01), or null if unset */
  starts_on: string | null
  /** First day of end month (YYYY-MM-01), or null if unset */
  ends_on: string | null
  created_at: string
}

export type DbSeasonRoster = {
  id: string
  season_id: string
  team_id: string
  player_id: string
  primary_jersey_number: number | null
  created_at: string
}

export type DbMatch = {
  id: string
  team_id: string
  season_id: string
  coach_id: string | null
  coach_name: string | null
  opponent: string
  date: string
  match_date: string | null
  match_time: string | null
  half_length: number
  location: string
  location_type?: string | null
  tournament_game: boolean
  home_score: number
  away_score: number
  clock_seconds: number
  period: '1st' | '2nd'
  status: 'active' | 'scheduled' | 'pending_review' | 'completed'
  period_clock_started: boolean
  /** Staff-only post-game notes — not for parent emails. */
  internal_coach_notes: string | null
  /** Parent-facing weekly recap summary used in email drafts. */
  parent_facing_recap: string | null
  stat_tracker_token?: string | null
  qualitative_context?: QualitativeContextJson | null
  created_at: string
}

export type QualitativeContextJson = {
  executionScore?: number | null
  opponentTier?: string | null
  /** @deprecated Legacy key — read-only */
  oppositionStrength?: string | null
  endedOnTime?: boolean | null
  addedTimeSeconds?: number
}

export type DbMatchEvent = {
  id: string
  match_id: string
  player_id: string | null
  event_type:
    | 'goal'
    | 'assist'
    | 'sub_in'
    | 'sub_out'
    | 'position_change'
    | 'opponent_goal'
    | 'formation_change'
    | 'stat_shot_on_target'
    | 'stat_shot_off_target'
    | 'stat_goal'
    | 'stat_assist'
    | 'stat_dribble'
    | 'stat_tackle'
    | 'stat_save'
    | 'stat_pass'
    | 'stat_key_pass'
    | 'stat_team_log'
  timestamp: number
  event_notes: string | null
  formation: string | null
  assist_player_id: string | null
  created_at: string
}

export type DbMatchStatTracker = {
  id: string
  match_id: string
  token: string
  created_at: string
  revoked_at: string | null
}

export type DbMatchStat = {
  id: string
  match_id: string
  player_id: string
  total_minutes: number
  impact_score: number
  match_status: 'on-field' | 'bench' | 'absent'
  match_position: string
  total_seconds_played: number
  subbed_in_at: number | null
  is_first_half_starter: boolean
  is_second_half_starter: boolean
  attending: boolean
  plus_minus?: number
  is_match_guest?: boolean
  created_at: string
}

export type DbMatchReview = {
  id: string
  match_id: string
  player_id: string
  position: string
  impact_score: number
  review_notes: string | null
  created_at: string
  updated_at: string
}

export type DbLineupPreset = {
  id: string
  team_id: string
  preset_name: string
  formation_json: unknown
  created_at: string
  updated_at: string
}

export type DbUserRole = {
  user_id: string
  app_role: 'director' | 'coach' | 'pending'
  display_name: string | null
  created_at: string
  updated_at: string
}

export type DbProfile = {
  id: string
  email: string | null
  display_name: string | null
  created_at: string
  updated_at: string
}

export type DbTeamMember = {
  user_id: string
  team_id: string
  team_role: 'head_coach' | 'assistant_coach'
  created_at: string
}

export type DbStaffInvite = {
  id: string
  email: string
  display_name: string | null
  app_role: 'director' | 'coach'
  team_ids: string[]
  team_roles: Array<'head_coach' | 'assistant_coach'>
  default_team_role: 'head_coach' | 'assistant_coach'
  invited_by: string | null
  status: 'pending' | 'accepted' | 'cancelled'
  created_at: string
  accepted_at: string | null
  accepted_user_id: string | null
}

export type Database = {
  public: {
    Tables: {
      teams: { Row: DbTeam; Insert: Omit<DbTeam, 'id' | 'created_at'> & { id?: string; created_at?: string }; Update: Partial<DbTeam> }
      coaches: { Row: DbCoach; Insert: Omit<DbCoach, 'id' | 'created_at'> & { id?: string; created_at?: string }; Update: Partial<DbCoach> }
      players: { Row: DbPlayer; Insert: Omit<DbPlayer, 'id' | 'created_at'> & { id?: string; created_at?: string }; Update: Partial<DbPlayer> }
      matches: { Row: DbMatch; Insert: Partial<DbMatch> & Pick<DbMatch, 'team_id'>; Update: Partial<DbMatch> }
      match_events: { Row: DbMatchEvent; Insert: Omit<DbMatchEvent, 'id' | 'created_at'> & { id?: string; created_at?: string }; Update: Partial<DbMatchEvent> }
      match_stats: { Row: DbMatchStat; Insert: Omit<DbMatchStat, 'id' | 'created_at'> & { id?: string; created_at?: string }; Update: Partial<DbMatchStat> }
      match_reviews: { Row: DbMatchReview; Insert: Omit<DbMatchReview, 'id' | 'created_at' | 'updated_at'> & { id?: string; created_at?: string }; Update: Partial<DbMatchReview> }
      match_stat_trackers: { Row: DbMatchStatTracker; Insert: Omit<DbMatchStatTracker, 'id' | 'created_at'> & { id?: string; created_at?: string }; Update: Partial<DbMatchStatTracker> }
      lineup_presets: { Row: DbLineupPreset; Insert: Omit<DbLineupPreset, 'id' | 'created_at' | 'updated_at'> & { id?: string; created_at?: string; updated_at?: string }; Update: Partial<DbLineupPreset> }
      user_roles: { Row: DbUserRole; Insert: Omit<DbUserRole, 'created_at' | 'updated_at'> & { created_at?: string; updated_at?: string }; Update: Partial<DbUserRole> }
      profiles: { Row: DbProfile; Insert: Omit<DbProfile, 'created_at' | 'updated_at'> & { created_at?: string; updated_at?: string }; Update: Partial<DbProfile> }
      team_members: { Row: DbTeamMember; Insert: Omit<DbTeamMember, 'created_at'> & { created_at?: string }; Update: Partial<DbTeamMember> }
      staff_invites: { Row: DbStaffInvite; Insert: Omit<DbStaffInvite, 'id' | 'created_at' | 'accepted_at' | 'accepted_user_id' | 'status'> & { id?: string; created_at?: string; status?: DbStaffInvite['status']; accepted_at?: string | null; accepted_user_id?: string | null }; Update: Partial<DbStaffInvite> }
    }
  }
}
