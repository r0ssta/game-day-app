import { apiUpdateGoal } from '@/lib/match-api'

export async function updateGoalCreditsForMatch(
  matchId: string,
  eventId: string,
  scorerId: string | null,
  assistPlayerId: string | null,
): Promise<{ eventId: string; scorerId: string | null; assistPlayerId: string | null }> {
  const result = await apiUpdateGoal({ matchId, eventId, scorerId, assistPlayerId })
  if (!result.ok) {
    throw new Error(result.error || 'Failed to update goal')
  }
  return {
    eventId: result.eventId,
    scorerId: result.scorerId,
    assistPlayerId: result.assistPlayerId,
  }
}
