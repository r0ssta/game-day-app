import { apiRemoveGoal, apiRemoveLastGoal } from '@/lib/match-api'
import type { RemoveGoalReason } from '@/schemas/match-actions'

export async function removeLastGoalForMatch(
  matchId: string,
  side: 'home' | 'away',
): Promise<{ homeScore: number; awayScore: number; removedPairedShot: boolean }> {
  const result = await apiRemoveLastGoal({ matchId, side })
  if (!result.ok) {
    throw new Error(result.error || 'Failed to remove goal')
  }
  return {
    homeScore: result.homeScore,
    awayScore: result.awayScore,
    removedPairedShot: result.removedPairedShot,
  }
}

export async function removeGoalForMatch(
  matchId: string,
  eventId: string,
  reason: RemoveGoalReason,
  teamSlug?: string | null,
): Promise<{
  homeScore: number
  awayScore: number
  removedPairedShot: boolean
  side: 'home' | 'away'
  reason: RemoveGoalReason
}> {
  const result = await apiRemoveGoal({ matchId, eventId, reason, teamSlug })
  if (!result.ok) {
    throw new Error(result.error || 'Failed to remove goal')
  }
  return {
    homeScore: result.homeScore,
    awayScore: result.awayScore,
    removedPairedShot: result.removedPairedShot,
    side: result.side,
    reason: result.reason as RemoveGoalReason,
  }
}
