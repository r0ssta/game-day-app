import { apiRemoveLastGoal } from '@/lib/match-api'

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
