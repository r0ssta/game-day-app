export type Impact = 'neutral' | 'positive' | 'negative'

/** Top-level app views: home → team | match_setup | reporting | recap_history → match | halftime | penalty_shootout → recap → home */
export type AppMode =
  | 'home'
  | 'team'
  | 'match_setup'
  | 'reporting'
  | 'recap_history'
  | 'club_admin'
  | 'match'
  | 'halftime'
  | 'penalty_shootout'
  | 'recap'

export type ActionType = 'GOAL' | 'ASSIST'

export type MatchPeriod = '1st' | '2nd' | '3rd'

/** 2 = regulation halves; 3 = periods (e.g. U9/U10 league). */
export type TotalPeriods = 2 | 3

/** Permanent club-pool player — season team assignment is via season_rosters. */
export type RosterPlayer = {
  id: string
  /** Team this player is rostered for in the active season (empty for unassigned pool). */
  teamId: string
  number: number | null
  firstName: string
  lastName: string
  position: string
  primaryPosition: string
  secondaryPosition: string
  ageGroup: string | null
  /** True when attending this match as a guest (not on the team's season roster). */
  isGuest: boolean
  activeStatus: boolean
}

/** Active match lineup entry — single source of truth lives in the master players array */
export type MatchPlayer = RosterPlayer & {
  impact: Impact
  attending: boolean
  /** Frozen at kickoff — used to flag non-starters on the next-period lineup */
  isFirstHalfStarter: boolean
  /** Set when 2nd half begins */
  isSecondHalfStarter: boolean
  isOnField: boolean
  matchPosition: string
  totalSecondsPlayed: number
  subbedInAt: number | null
  plusMinus: number
  /** Yellow cards received in this match (0–2). */
  yellowCardCount: number
  /** True after a red card — locked out of the bench for the rest of the match. */
  isSentOff: boolean
}

export type MatchSetupConfig = {
  locationType: 'home' | 'away'
  tournamentGame: boolean
  goesToPks: boolean
  /** Minutes per half/period. */
  halfLengthMinutes: number
  totalPeriods: TotalPeriods
}

export type SetupLineup = {
  attending: Record<string, boolean>
  startFirstHalf: Record<string, boolean>
}

export type MatchPositionsConfig = Record<string, string>

export type MatchFormations = {
  first: string
  second: string
}

export function isOnField(player: MatchPlayer): boolean {
  return player.attending && player.isOnField
}
