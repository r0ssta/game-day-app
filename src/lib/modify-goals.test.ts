import { describe, expect, it } from 'vitest'
import {
  formatGoalMinuteMark,
  goalEventsForSide,
  goalMinuteFromTimestamp,
  timestampFromGoalMinute,
} from './modify-goals'
import type { DbMatchEvent } from '@/types/database'

function event(partial: Partial<DbMatchEvent> & Pick<DbMatchEvent, 'id' | 'event_type'>): DbMatchEvent {
  return {
    match_id: 'm1',
    player_id: null,
    timestamp: 0,
    event_notes: null,
    formation: null,
    assist_player_id: null,
    created_at: '2026-01-01T00:00:00.000Z',
    ...partial,
  } as DbMatchEvent
}

describe('goalEventsForSide', () => {
  it('returns home goals in created order and marks editable credits', () => {
    const rows = goalEventsForSide(
      [
        event({
          id: 'g2',
          event_type: 'goal',
          player_id: 'p1',
          assist_player_id: 'p2',
          timestamp: 120,
          created_at: '2026-01-01T00:02:00.000Z',
        }),
        event({
          id: 'g1',
          event_type: 'goal',
          event_notes: 'Own Goal',
          timestamp: 60,
          created_at: '2026-01-01T00:01:00.000Z',
        }),
        event({ id: 'og', event_type: 'opponent_goal', created_at: '2026-01-01T00:03:00.000Z' }),
      ],
      'home',
    )

    expect(rows.map((row) => row.id)).toEqual(['g1', 'g2'])
    expect(rows[0]?.canEditCredits).toBe(false)
    expect(rows[0]?.isOwnGoal).toBe(true)
    expect(rows[1]?.canEditCredits).toBe(true)
    expect(rows[1]?.assistPlayerId).toBe('p2')
  })
})

describe('formatGoalMinuteMark', () => {
  it('floors seconds to a minute mark', () => {
    expect(formatGoalMinuteMark(0)).toBe("0'")
    expect(formatGoalMinuteMark(59)).toBe("0'")
    expect(formatGoalMinuteMark(60)).toBe("1'")
    expect(formatGoalMinuteMark(125)).toBe("2'")
  })
})

describe('goal minute round-trip', () => {
  it('converts minutes to stored timestamps', () => {
    expect(goalMinuteFromTimestamp(125)).toBe(2)
    expect(timestampFromGoalMinute(2)).toBe(120)
    expect(timestampFromGoalMinute(-1)).toBe(0)
  })
})
