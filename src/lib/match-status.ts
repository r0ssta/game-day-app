/**
 * Match lifecycle statuses.
 *
 * - scheduled: preloaded fixture (no live clock / parent push yet)
 * - live: in-progress regulation
 * - extra_time_first_half / extra_time_second_half: tournament extra time
 * - penalty_shootout: live PK shootout after regulation or extra time
 * - pending_review: whistle over, coach recap not finalized
 * - final: recap complete / archived result
 */
export type MatchStatus =
  | 'scheduled'
  | 'live'
  | 'extra_time_first_half'
  | 'extra_time_second_half'
  | 'penalty_shootout'
  | 'pending_review'
  | 'final'

export const MATCH_STATUS = {
  scheduled: 'scheduled',
  live: 'live',
  extraTimeFirstHalf: 'extra_time_first_half',
  extraTimeSecondHalf: 'extra_time_second_half',
  penaltyShootout: 'penalty_shootout',
  pendingReview: 'pending_review',
  final: 'final',
} as const satisfies Record<string, MatchStatus>

export const IN_PROGRESS_MATCH_STATUSES = [
  MATCH_STATUS.live,
  MATCH_STATUS.extraTimeFirstHalf,
  MATCH_STATUS.extraTimeSecondHalf,
  MATCH_STATUS.penaltyShootout,
] as const satisfies readonly MatchStatus[]

export function isLiveMatchStatus(status: string | null | undefined): boolean {
  return (IN_PROGRESS_MATCH_STATUSES as readonly string[]).includes(status ?? '')
}

/**
 * The coach opened the match screen, but Start Half has not run.
 * Status is already `live` and the clock is still the full first-half length.
 * Halftime keeps a stopped clock with time already run off, so it stays live.
 */
export function isAwaitingKickoff(match: {
  status?: string | null
  period_clock_started?: boolean
  periodClockStarted?: boolean
  current_period?: number | null
  currentPeriod?: number | null
  period?: string | null
  home_score?: number
  homeScore?: number
  away_score?: number
  awayScore?: number
  clock_seconds?: number
  clockSeconds?: number
  half_length?: number
  halfLength?: number
  period_length?: number | null
  periodLength?: number | null
}): boolean {
  if (match.status !== MATCH_STATUS.live) return false
  const clockStarted = match.period_clock_started ?? match.periodClockStarted ?? false
  if (clockStarted) return false
  const period = (match.period ?? '').trim().toLowerCase()
  if (period && period !== '1st' && period !== '1') return false
  const current = match.current_period ?? match.currentPeriod ?? 1
  if (current > 1) return false
  const home = match.home_score ?? match.homeScore ?? 0
  const away = match.away_score ?? match.awayScore ?? 0
  if (home !== 0 || away !== 0) return false
  const halfMinutes = match.period_length ?? match.periodLength ?? match.half_length ?? match.halfLength ?? 0
  const fullSeconds = Math.max(0, halfMinutes) * 60
  if (fullSeconds <= 0) return false
  const clock = match.clock_seconds ?? match.clockSeconds ?? 0
  return clock >= fullSeconds
}

/** In progress for parents. The pre-kickoff ready screen stays a fixture. */
export function isParentVisibleLive(match: {
  status?: string | null
  period_clock_started?: boolean
  periodClockStarted?: boolean
  current_period?: number | null
  currentPeriod?: number | null
  period?: string | null
  home_score?: number
  homeScore?: number
  away_score?: number
  awayScore?: number
  clock_seconds?: number
  clockSeconds?: number
  half_length?: number
  halfLength?: number
  period_length?: number | null
  periodLength?: number | null
}): boolean {
  return isLiveMatchStatus(match.status) && !isAwaitingKickoff(match)
}

export function parentFacingMatchStatus(match: {
  status?: string | null
  period_clock_started?: boolean
  periodClockStarted?: boolean
  current_period?: number | null
  currentPeriod?: number | null
  period?: string | null
  home_score?: number
  homeScore?: number
  away_score?: number
  awayScore?: number
  clock_seconds?: number
  clockSeconds?: number
  half_length?: number
  halfLength?: number
  period_length?: number | null
  periodLength?: number | null
}): string {
  if (isAwaitingKickoff(match)) return MATCH_STATUS.scheduled
  return match.status ?? MATCH_STATUS.scheduled
}

export function isExtraTimeStatus(status: string | null | undefined): boolean {
  return (
    status === MATCH_STATUS.extraTimeFirstHalf ||
    status === MATCH_STATUS.extraTimeSecondHalf
  )
}

export function extraTimeHalfFromStatus(
  status: string | null | undefined,
): 1 | 2 | null {
  if (status === MATCH_STATUS.extraTimeFirstHalf) return 1
  if (status === MATCH_STATUS.extraTimeSecondHalf) return 2
  return null
}

export function isScheduledMatchStatus(status: string | null | undefined): boolean {
  return status === MATCH_STATUS.scheduled
}

export function isFinalMatchStatus(status: string | null | undefined): boolean {
  return status === MATCH_STATUS.final || status === MATCH_STATUS.pendingReview
}

export function isCompletedResultStatus(status: string | null | undefined): boolean {
  return status === MATCH_STATUS.final
}

/** Home / nav live state must belong to the team currently selected. */
export function isSessionMatchForSelectedTeam(
  matchStatus: string | null | undefined,
  matchId: string | null | undefined,
  sessionTeamId: string | null | undefined,
  selectedTeamId: string | null | undefined,
  status: MatchStatus,
): boolean {
  return (
    matchStatus === status &&
    Boolean(matchId) &&
    Boolean(selectedTeamId) &&
    sessionTeamId === selectedTeamId
  )
}

/** True when this device's in-progress match belongs to the selected team. */
export function isSessionInProgressMatchForSelectedTeam(
  matchStatus: string | null | undefined,
  matchId: string | null | undefined,
  sessionTeamId: string | null | undefined,
  selectedTeamId: string | null | undefined,
): boolean {
  return (
    isLiveMatchStatus(matchStatus) &&
    Boolean(matchId) &&
    Boolean(selectedTeamId) &&
    sessionTeamId === selectedTeamId
  )
}
