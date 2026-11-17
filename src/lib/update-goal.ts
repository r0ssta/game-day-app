import { apiUpdateGoal } from '@/lib/match-api'

export async function updateGoalForMatch(input: {
  matchId: string
  eventId: string
  scorerId?: string | null
  assistPlayerId?: string | null
  timestamp?: number
  teamSlug?: string | null
}): Promise<{
  eventId: string
  scorerId: string | null
  assistPlayerId: string | null
  timestamp: number
}> {
  const result = await apiUpdateGoal(input)
  if (!result.ok) {
    throw new Error(result.error || 'Failed to update goal')
  }
  return {
    eventId: result.eventId,
    scorerId: result.scorerId,
    assistPlayerId: result.assistPlayerId,
    timestamp: result.timestamp,
  }
}
