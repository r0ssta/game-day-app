import {
  deleteMatchEvent,
  fetchMatchById,
  fetchMatchEvents,
  findLastGoalEvent,
  findPairedGoalShotEvent,
  persistMatchPlusMinusFromEvents,
  updateMatchRecord,
} from '@/lib/supabase-api'

export async function removeLastGoalForMatch(
  matchId: string,
  side: 'home' | 'away',
): Promise<{ homeScore: number; awayScore: number; removedPairedShot: boolean }> {
  const match = await fetchMatchById(matchId)
  if (!match) throw new Error('Match not found')

  const events = await fetchMatchEvents(matchId)
  const goalEvent = findLastGoalEvent(events, side)
  if (!goalEvent) throw new Error('No goal to remove')

  const pairedShot = findPairedGoalShotEvent(events, goalEvent)
  await deleteMatchEvent(goalEvent.id)
  if (pairedShot) {
    await deleteMatchEvent(pairedShot.id)
  }

  const homeScore = side === 'home' ? Math.max(0, match.home_score - 1) : match.home_score
  const awayScore = side === 'away' ? Math.max(0, match.away_score - 1) : match.away_score

  await updateMatchRecord(matchId, { home_score: homeScore, away_score: awayScore })
  await persistMatchPlusMinusFromEvents(matchId)

  return {
    homeScore,
    awayScore,
    removedPairedShot: Boolean(pairedShot),
  }
}
