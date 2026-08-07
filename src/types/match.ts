export type Impact = 'neutral' | 'positive' | 'negative'

/** Top-level app views: home → team | match_setup | reporting → match | halftime → recap → home */
export type AppMode = 'home' | 'team' | 'match_setup' | 'reporting' | 'match' | 'halftime' | 'recap'

export type ActionType = 'GOAL' | 'ASSIST'

export type MatchPeriod = '1st' | '2nd'

/** Permanent roster entry — no match-specific fields */
export type RosterPlayer = {
  id: string
  teamId: string
  number: number | null
  firstName: string
  lastName: string
  position: string
  primaryPosition: string
  secondaryPosition: string
  isGuest: boolean
  activeStatus: boolean
}

/** Active match lineup entry — single source of truth lives in the master players array */
export type MatchPlayer = RosterPlayer & {
  impact: Impact
  attending: boolean
  /** Frozen at kickoff — used for halftime badge */
  isFirstHalfStarter: boolean
  /** Set when 2nd half begins */
  isSecondHalfStarter: boolean
  isOnField: boolean
  matchPosition: string
  totalSecondsPlayed: number
  subbedInAt: number | null
  plusMinus: number
}

/** @deprecated Use MatchPlayer in match context */
export type Player = MatchPlayer

export type MatchSetupConfig = {
  locationType: 'home' | 'away'
  tournamentGame: boolean
  halfLengthMinutes: number
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
