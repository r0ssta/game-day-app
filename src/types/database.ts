export type DbTeam = {
  id: string
  name: string
  /** URL-safe unique key for public Parent Hub (`/hub/:slug`). */
  slug: string
  /** Hex theme used by the dynamic PWA manifest (`#rrggbb`). */
  brand_color: string
  /** Optional Home Screen icon URL; falls back to club crest when null. */
  logo_url: string | null
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
  /** Minutes per period/half. Prefer this over legacy half_length when present. */
  period_length?: number
  /** 2 = halves, 3 = periods. */
  total_periods?: number
  /** 1-based active period index (1..total_periods). */
  current_period?: number
  location: string
  location_type?: string | null
  tournament_game: boolean
  /** Staff-only smoke/test match — hidden from Parent Hub and parent push. */
  is_test: boolean
  goes_to_pks: boolean
  home_score: number
  away_score: number
  home_pk_score: number
  away_pk_score: number
  /** null until a PK shootout is finalized; true = we won on PKs. */
  pk_winner_is_us: boolean | null
  /** Our goalkeeper for the penalty shootout. */
  pk_gk_player_id?: string | null
  clock_seconds: number
  period: '1st' | '2nd' | '3rd'
  status: 'scheduled' | 'live' | 'pending_review' | 'final'
  period_clock_started: boolean
  /** Staff-only post-game notes — not for parent emails. */
  internal_coach_notes: string | null
  /** Parent-facing weekly recap summary used in email drafts. */
  parent_facing_recap: string | null
  /** Suggested sub rotation length in seconds (from Subbing Assistant). */
  sub_interval_seconds: number | null
  /** When true, GK is held out of equal-play outfield rotation. */
  gk_plays_full_half: boolean
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
  /** Formation id saved when a match is preloaded as scheduled. */
  preloadFormation?: string | null
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
    | 'pk_attempt'
    | 'yellow_card'
    | 'red_card'
    | 'shot_home'
    | 'shot_away'
    | 'save_home'
    | 'save_away'
    | 'corner_home'
    | 'corner_away'
  timestamp: number
  event_notes: string | null
  formation: string | null
  assist_player_id: string | null
  /** True when a regulation goal / opponent_goal came from a penalty kick. */
  is_pk?: boolean
  /** Present for pk_attempt events. */
  pk_result: 'make' | 'miss' | null
  /** Present for pk_attempt events. */
  pk_team: 'us' | 'opponent' | null
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
  /** True after a red card (straight or second yellow). */
  is_sent_off?: boolean
  created_at: string
}

export type DbMatchReview = {
  id: string
  match_id: string
  player_id: string
  position: string
  /** Post-match evaluation on a 1–5 scale. */
  rating: number
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

export type DbWebPushSubscription = {
  id: string
  endpoint: string
  p256dh: string
  auth: string
  team_id: string
  target_player_id: string | null
  user_agent: string | null
  created_at: string
  updated_at: string
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

/** JSON values returned by public RPCs (Parent Hub, invites, web push). */
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

type ForeignKey = {
  foreignKeyName: string
  columns: string[]
  isOneToOne?: boolean
  referencedRelation: string
  referencedColumns: string[]
}

/** supabase-js requires `Relationships` on every table; default to none. */
type WithRelationships<T> = {
  [K in keyof T]: T[K] extends { Relationships: ForeignKey[] }
    ? T[K]
    : T[K] & { Relationships: [] }
}

export type Database = {
  public: {
    Tables: WithRelationships<{
      teams: {
        Row: DbTeam
        Insert: Omit<DbTeam, 'id' | 'created_at' | 'slug' | 'brand_color' | 'logo_url'> & {
          id?: string
          created_at?: string
          /** Omitted → DB trigger allocates from name */
          slug?: string
          brand_color?: string
          logo_url?: string | null
        }
        Update: Partial<DbTeam>
      }
      coaches: {
        Row: DbCoach
        Insert: Omit<DbCoach, 'id' | 'created_at'> & { id?: string; created_at?: string }
        Update: Partial<DbCoach>
      }
      players: {
        Row: DbPlayer
        Insert: Omit<DbPlayer, 'id' | 'created_at'> & { id?: string; created_at?: string }
        Update: Partial<DbPlayer>
      }
      matches: {
        Row: DbMatch
        Insert: Partial<DbMatch> & Pick<DbMatch, 'team_id'>
        Update: Partial<DbMatch>
      }
      match_events: {
        Row: DbMatchEvent
        Insert: Omit<DbMatchEvent, 'id' | 'created_at'> & { id?: string; created_at?: string }
        Update: Partial<DbMatchEvent>
        Relationships: [
          {
            foreignKeyName: 'match_events_match_id_fkey'
            columns: ['match_id']
            isOneToOne: false
            referencedRelation: 'matches'
            referencedColumns: ['id']
          },
        ]
      }
      match_stats: {
        Row: DbMatchStat
        Insert: Omit<DbMatchStat, 'id' | 'created_at'> & { id?: string; created_at?: string }
        Update: Partial<DbMatchStat>
        Relationships: [
          {
            foreignKeyName: 'match_stats_match_id_fkey'
            columns: ['match_id']
            isOneToOne: false
            referencedRelation: 'matches'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'match_stats_player_id_fkey'
            columns: ['player_id']
            isOneToOne: false
            referencedRelation: 'players'
            referencedColumns: ['id']
          },
        ]
      }
      match_reviews: {
        Row: DbMatchReview
        Insert: Omit<DbMatchReview, 'id' | 'created_at' | 'updated_at'> & {
          id?: string
          created_at?: string
          updated_at?: string
        }
        Update: Partial<DbMatchReview>
        Relationships: [
          {
            foreignKeyName: 'match_reviews_match_id_fkey'
            columns: ['match_id']
            isOneToOne: false
            referencedRelation: 'matches'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'match_reviews_player_id_fkey'
            columns: ['player_id']
            isOneToOne: false
            referencedRelation: 'players'
            referencedColumns: ['id']
          },
        ]
      }
      match_stat_trackers: {
        Row: DbMatchStatTracker
        Insert: Omit<DbMatchStatTracker, 'id' | 'created_at'> & { id?: string; created_at?: string }
        Update: Partial<DbMatchStatTracker>
      }
      lineup_presets: {
        Row: DbLineupPreset
        Insert: Omit<DbLineupPreset, 'id' | 'created_at' | 'updated_at'> & {
          id?: string
          created_at?: string
          updated_at?: string
        }
        Update: Partial<DbLineupPreset>
      }
      web_push_subscriptions: {
        Row: DbWebPushSubscription
        Insert: Omit<DbWebPushSubscription, 'id' | 'created_at' | 'updated_at'> & {
          id?: string
          created_at?: string
          updated_at?: string
        }
        Update: Partial<DbWebPushSubscription>
      }
      user_roles: {
        Row: DbUserRole
        Insert: Omit<DbUserRole, 'created_at' | 'updated_at'> & {
          created_at?: string
          updated_at?: string
        }
        Update: Partial<DbUserRole>
      }
      profiles: {
        Row: DbProfile
        Insert: Omit<DbProfile, 'created_at' | 'updated_at'> & {
          created_at?: string
          updated_at?: string
        }
        Update: Partial<DbProfile>
      }
      team_members: {
        Row: DbTeamMember
        Insert: Omit<DbTeamMember, 'created_at'> & { created_at?: string }
        Update: Partial<DbTeamMember>
      }
      staff_invites: {
        Row: DbStaffInvite
        Insert: Omit<
          DbStaffInvite,
          'id' | 'created_at' | 'accepted_at' | 'accepted_user_id' | 'status'
        > & {
          id?: string
          created_at?: string
          status?: DbStaffInvite['status']
          accepted_at?: string | null
          accepted_user_id?: string | null
        }
        Update: Partial<DbStaffInvite>
      }
      seasons: {
        Row: DbSeason
        Insert: Omit<DbSeason, 'id' | 'created_at' | 'status'> & {
          id?: string
          created_at?: string
          status?: SeasonStatus
        }
        Update: Partial<DbSeason>
      }
      season_rosters: {
        Row: DbSeasonRoster
        Insert: Omit<DbSeasonRoster, 'id' | 'created_at'> & {
          id?: string
          created_at?: string
          primary_jersey_number?: number | null
        }
        Update: Partial<DbSeasonRoster>
        Relationships: [
          {
            foreignKeyName: 'season_rosters_season_id_fkey'
            columns: ['season_id']
            isOneToOne: false
            referencedRelation: 'seasons'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'season_rosters_team_id_fkey'
            columns: ['team_id']
            isOneToOne: false
            referencedRelation: 'teams'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'season_rosters_player_id_fkey'
            columns: ['player_id']
            isOneToOne: false
            referencedRelation: 'players'
            referencedColumns: ['id']
          },
        ]
      }
    }>
    Views: {
      [_ in never]: never
    }
    Functions: {
      set_active_season: {
        Args: { p_season_id: string }
        Returns: DbSeason
      }
      get_parent_hub: {
        Args: { p_team_id: string; p_include_test?: boolean }
        Returns: Json
      }
      get_parent_hub_by_slug: {
        Args: { p_slug: string; p_include_test?: boolean }
        Returns: Json
      }
      get_parent_live_events: {
        Args: { p_match_id: string; p_include_test?: boolean }
        Returns: Json
      }
      subscribe_parent_web_push: {
        Args: {
          p_team_id: string
          p_endpoint: string
          p_p256dh: string
          p_auth: string
          p_target_player_id?: string | null
          p_user_agent?: string | null
        }
        Returns: Json
      }
      log_stat_tracker_event: {
        Args: {
          p_match_id: string
          p_token: string
          p_event_type: string
          p_timestamp: number
          p_player_id?: string | null
          p_event_notes?: string | null
        }
        Returns: undefined
      }
      delete_staff_user: {
        Args: { p_user_id: string }
        Returns: undefined
      }
      update_staff_display_name: {
        Args: { p_user_id: string; p_display_name: string }
        Returns: undefined
      }
      create_staff_invite: {
        Args: {
          p_email: string
          p_app_role: 'director' | 'coach'
          p_team_ids: string[]
          p_display_name?: string | null
          p_default_team_role?: 'head_coach' | 'assistant_coach'
          p_team_roles?: Array<'head_coach' | 'assistant_coach'>
        }
        Returns: Json
      }
      cancel_staff_invite: {
        Args: { p_invite_id: string }
        Returns: undefined
      }
      claim_bootstrap_director: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}
