export type DbTeam = {
  id: string
  name: string
  format: string
  primary_coach_name?: string
  created_at: string
}

export type DbCoach = {
  id: string
  name: string
  created_at: string
}

export type DbPlayer = {
  id: string
  team_id: string
  first_name: string
  last_name: string
  jersey: number | null
  active_status: boolean
  is_guest: boolean
  position: string
  primary_position: string | null
  secondary_position: string | null
  created_at: string
  /** @deprecated Legacy column — may exist before name migration */
  name?: string
}

export type DbMatch = {
  id: string
  team_id: string
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
  status: 'active' | 'pending_review' | 'completed'
  period_clock_started: boolean
  coach_summary_notes: string | null
  created_at: string
}

export type DbMatchEvent = {
  id: string
  match_id: string
  player_id: string | null
  event_type: 'goal' | 'assist' | 'sub_in' | 'sub_out' | 'position_change' | 'opponent_goal' | 'formation_change'
  timestamp: number
  event_notes: string | null
  formation: string | null
  assist_player_id: string | null
  created_at: string
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

export type Database = {
  public: {
    Tables: {
      teams: { Row: DbTeam; Insert: Omit<DbTeam, 'id' | 'created_at'> & { id?: string; created_at?: string }; Update: Partial<DbTeam> }
      coaches: { Row: DbCoach; Insert: Omit<DbCoach, 'id' | 'created_at'> & { id?: string; created_at?: string }; Update: Partial<DbCoach> }
      players: { Row: DbPlayer; Insert: Omit<DbPlayer, 'id' | 'created_at'> & { id?: string; created_at?: string }; Update: Partial<DbPlayer> }
      matches: { Row: DbMatch; Insert: Partial<DbMatch> & Pick<DbMatch, 'team_id'>; Update: Partial<DbMatch> }
      match_events: { Row: DbMatchEvent; Insert: Omit<DbMatchEvent, 'id' | 'created_at'> & { id?: string; created_at?: string }; Update: Partial<DbMatchEvent> }
      match_stats: { Row: DbMatchStat; Insert: Omit<DbMatchStat, 'id' | 'created_at'> & { id?: string; created_at?: string }; Update: Partial<DbMatchStat> }
      match_reviews: { Row: DbMatchReview; Insert: Omit<DbMatchReview, 'id' | 'created_at' | 'updated_at'> & { id?: string; created_at?: string; updated_at?: string }; Update: Partial<DbMatchReview> }
      lineup_presets: { Row: DbLineupPreset; Insert: Omit<DbLineupPreset, 'id' | 'created_at' | 'updated_at'> & { id?: string; created_at?: string; updated_at?: string }; Update: Partial<DbLineupPreset> }
    }
  }
}
