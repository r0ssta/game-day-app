export type DbTeam = {
  id: string
  name: string
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
  name: string
  jersey: number | null
  active_status: boolean
  is_guest: boolean
  position: string
  created_at: string
}

export type DbMatch = {
  id: string
  team_id: string
  coach_id: string | null
  opponent: string
  date: string
  match_date: string | null
  match_time: string | null
  half_length: number
  location: string
  tournament_game: boolean
  home_score: number
  away_score: number
  clock_seconds: number
  period: '1st' | '2nd'
  status: 'active' | 'completed'
  period_clock_started: boolean
  created_at: string
}

export type DbMatchEvent = {
  id: string
  match_id: string
  player_id: string
  event_type: 'goal' | 'assist' | 'sub_in' | 'sub_out' | 'position_change'
  timestamp: number
  event_notes: string | null
  formation: string | null
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

export type Database = {
  public: {
    Tables: {
      teams: { Row: DbTeam; Insert: Omit<DbTeam, 'id' | 'created_at'> & { id?: string; created_at?: string }; Update: Partial<DbTeam> }
      coaches: { Row: DbCoach; Insert: Omit<DbCoach, 'id' | 'created_at'> & { id?: string; created_at?: string }; Update: Partial<DbCoach> }
      players: { Row: DbPlayer; Insert: Omit<DbPlayer, 'id' | 'created_at'> & { id?: string; created_at?: string }; Update: Partial<DbPlayer> }
      matches: { Row: DbMatch; Insert: Partial<DbMatch> & Pick<DbMatch, 'team_id'>; Update: Partial<DbMatch> }
      match_events: { Row: DbMatchEvent; Insert: Omit<DbMatchEvent, 'id' | 'created_at'> & { id?: string; created_at?: string }; Update: Partial<DbMatchEvent> }
      match_stats: { Row: DbMatchStat; Insert: Omit<DbMatchStat, 'id' | 'created_at'> & { id?: string; created_at?: string }; Update: Partial<DbMatchStat> }
    }
  }
}
