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
