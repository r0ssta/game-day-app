export type Impact = 'neutral' | 'positive' | 'negative'

export type AppMode = 'setup' | 'match' | 'halftime' | 'recap'

export type ActionType = 'GOAL' | 'ASSIST'

export type MatchPeriod = '1st' | '2nd'

/** Permanent roster entry — no match-specific fields */
export type RosterPlayer = {
  id: string
  teamId: string
  number: number | null
  name: string
  position: string
  isGuest: boolean
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
}

/** @deprecated Use MatchPlayer in match context */
export type Player = MatchPlayer

export type MatchSetupConfig = {
  location: string
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
