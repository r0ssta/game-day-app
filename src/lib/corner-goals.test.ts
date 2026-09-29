import { describe, expect, it } from 'vitest'
import { countCornerGoals, goalIdsFromCorners } from './corner-goals'
import { startingLineupNote } from './match-event-notes'

function clock(
  id: string,
  eventType: string,
  timestamp: number,
  createdAt: string,
  eventNotes?: string | null,
) {
  return { id, eventType, timestamp, createdAt, eventNotes: eventNotes ?? null }
}

describe('goalIdsFromCorners', () => {
  it('marks a goal within a minute of that team’s corner', () => {
    const events = [
      clock('c', 'corner_home', 100, '2026-09-29T18:00:00.000Z'),
      clock('g', 'goal', 131, '2026-09-29T18:00:31.000Z'),
      clock('edge', 'goal', 160, '2026-09-29T18:01:00.000Z'),
      clock('late', 'goal', 161, '2026-09-29T18:01:01.000Z'),
      clock('their-corner', 'corner_away', 200, '2026-09-29T18:04:00.000Z'),
      clock('their-goal', 'opponent_goal', 220, '2026-09-29T18:04:20.000Z'),
      clock('counter', 'goal', 225, '2026-09-29T18:04:25.000Z'),
    ]

    expect(goalIdsFromCorners(events)).toEqual(new Set(['g', 'edge', 'their-goal']))
    expect(countCornerGoals(events)).toEqual({ us: 2, them: 1 })
  })

  it('does not carry a corner into the next period', () => {
    const events = [
      clock('c', 'corner_home', 100, '2026-09-29T18:10:00.000Z'),
      clock('kick', 'sub_in', 0, '2026-09-29T18:40:00.000Z', startingLineupNote('ST')),
      clock('g', 'goal', 120, '2026-09-29T18:42:00.000Z'),
    ]

    expect(goalIdsFromCorners(events).size).toBe(0)
  })

  it('uses the coach yes or no instead of the clock', () => {
    const events = [
      clock('c', 'corner_home', 100, '2026-09-29T18:00:00.000Z'),
      { ...clock('no', 'goal', 120, '2026-09-29T18:00:20.000Z'), fromCorner: false },
      { ...clock('yes', 'goal', 220, '2026-09-29T18:02:00.000Z'), fromCorner: true },
    ]

    expect(goalIdsFromCorners(events)).toEqual(new Set(['yes']))
    expect(countCornerGoals(events)).toEqual({ us: 1, them: 0 })
  })
})
