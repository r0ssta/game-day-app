/**
 * Match lifecycle statuses.
 *
 * - scheduled: preloaded fixture (no live clock / parent push yet)
 * - live: in-progress game day (was historically `active`)
 * - pending_review: regulation over, coach recap not finalized
 * - final: recap complete / archived result (was historically `completed`)
 */
export type MatchStatus = 'scheduled' | 'live' | 'pending_review' | 'final'

export const MATCH_STATUS = {
  scheduled: 'scheduled',
  live: 'live',
  pendingReview: 'pending_review',
  final: 'final',
} as const satisfies Record<string, MatchStatus>

export function isLiveMatchStatus(status: string | null | undefined): boolean {
  return status === MATCH_STATUS.live
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
