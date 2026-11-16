import { isOwnGoalType, parseGoalType } from '@/schemas/match-actions'
import type { DbMatchEvent } from '@/types/database'

export type ModifyGoalSide = 'home' | 'away'

export type ModifyGoalRow = {
  id: string
  side: ModifyGoalSide
  eventType: 'goal' | 'opponent_goal'
  timestamp: number
  createdAt: string
  scorerId: string | null
  assistPlayerId: string | null
  eventNotes: string | null
  isOwnGoal: boolean
  isPk: boolean
  /** Scorer/assist retag is only for our non-own-goal events. */
  canEditCredits: boolean
}

export function goalEventsForSide(
  events: DbMatchEvent[],
  side: ModifyGoalSide,
): ModifyGoalRow[] {
  const eventType: ModifyGoalRow['eventType'] = side === 'home' ? 'goal' : 'opponent_goal'
  return events
    .filter((event): event is DbMatchEvent & { event_type: 'goal' | 'opponent_goal' } =>
      event.event_type === eventType,
    )
    .map((event) => {
      const notes = event.event_notes
      const ownGoal = isOwnGoalType(notes)
      const goalType = parseGoalType(notes)
      const isPk = event.is_pk === true || goalType === 'PK'
      return {
        id: event.id,
        side,
        eventType,
        timestamp: event.timestamp,
        createdAt: event.created_at,
        scorerId: event.player_id,
        assistPlayerId: event.assist_player_id,
        eventNotes: notes,
        isOwnGoal: ownGoal,
        isPk,
        canEditCredits: eventType === 'goal' && !ownGoal,
      } satisfies ModifyGoalRow
    })
    .sort(
      (a, b) =>
        a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
    )
}

export function formatGoalMinuteMark(timestampSeconds: number): string {
  const minute = Math.max(0, Math.floor(timestampSeconds / 60))
  return `${minute}'`
}

export const REMOVE_GOAL_REASON_LABELS = {
  accident: 'Logged by accident',
  disallowed: 'Offside / ref involvement',
} as const
