import { describe, expect, it } from 'vitest'
import { startingLineupNote } from '@/lib/match-event-notes'
import {
  buildGoalScoreboard,
  formatScoreboardGoalLine,
  formatScoreboardMinute,
} from '@/lib/goal-scoreboard'
import type { ParentHubPlayer, ParentLiveEvent } from '@/lib/parent-hub'

const players: ParentHubPlayer[] = [
  { id: 'p1', firstName: 'Ada', lastName: 'Lopez', number: 7 },
  { id: 'p2', firstName: 'Bess', lastName: 'Chen', number: 9 },
  { id: 'p3', firstName: 'Bea', lastName: 'Lopez', number: 4 },
]

function event(
  partial: Partial<ParentLiveEvent> & Pick<ParentLiveEvent, 'id' | 'eventType'>,
): ParentLiveEvent {
  return {
    matchId: 'm1',
    playerId: null,
    playerName: null,
    jersey: null,
    timestamp: 0,
    eventNotes: null,
    isPk: false,
    assistPlayerId: null,
    assistPlayerName: null,
    createdAt: '2026-09-02T18:00:00.000Z',
    ...partial,
  }
}

describe('formatScoreboardMinute', () => {
  it('matches the feed minute and stacks halves', () => {
    expect(
      formatScoreboardMinute({
        timestampSeconds: 12 * 60 + 34,
        periodIndex: 1,
        periodLengthMinutes: 30,
      }),
    ).toBe("12'")
    expect(
      formatScoreboardMinute({
        timestampSeconds: 30,
        periodIndex: 1,
        periodLengthMinutes: 30,
      }),
    ).toBe("1'")
    expect(
      formatScoreboardMinute({
        timestampSeconds: 5 * 60,
        periodIndex: 2,
        periodLengthMinutes: 30,
      }),
    ).toBe("35'")
  })

  it('writes stoppage the way a scoreboard does', () => {
    expect(
      formatScoreboardMinute({
        timestampSeconds: 31 * 60,
        periodIndex: 1,
        periodLengthMinutes: 30,
      }),
    ).toBe("30+1'")
    expect(
      formatScoreboardMinute({
        timestampSeconds: 32 * 60,
        periodIndex: 2,
        periodLengthMinutes: 30,
      }),
    ).toBe("60+2'")
  })

  it('keeps a third period and extra time on their own clocks', () => {
    expect(
      formatScoreboardMinute({
        timestampSeconds: 2 * 60,
        periodIndex: 3,
        periodLengthMinutes: 18,
        totalPeriods: 3,
      }),
    ).toBe("38'")
    expect(
      formatScoreboardMinute({
        timestampSeconds: 4 * 60,
        periodIndex: 3,
        periodLengthMinutes: 30,
        totalPeriods: 2,
      }),
    ).toBe("ET1 4'")
  })
})

describe('formatScoreboardGoalLine', () => {
  it('adds an assist or a penalty only when present', () => {
    expect(
      formatScoreboardGoalLine({
        scorer: 'Lopez',
        minute: "12'",
        assist: 'Chen',
        penalty: false,
        ownGoal: false,
      }),
    ).toBe("Lopez 12' (Chen)")
    expect(
      formatScoreboardGoalLine({
        scorer: 'Lopez',
        minute: "44'",
        assist: null,
        penalty: true,
        ownGoal: false,
      }),
    ).toBe("Lopez 44' (PK)")
    expect(
      formatScoreboardGoalLine({
        scorer: null,
        minute: "23'",
        assist: null,
        penalty: false,
        ownGoal: false,
      }),
    ).toBe("23'")
    expect(
      formatScoreboardGoalLine({
        scorer: 'Lopez',
        minute: "8'",
        assist: null,
        penalty: false,
        ownGoal: true,
      }),
    ).toBe("Own goal 8'")
  })
})

describe('buildGoalScoreboard', () => {
  it('lists scorers under each side in match order', () => {
    const board = buildGoalScoreboard(
      [
        event({
          id: 'lu1',
          eventType: 'sub_in',
          eventNotes: startingLineupNote('ST'),
          timestamp: 0,
          createdAt: '2026-09-02T18:00:00.000Z',
        }),
        event({
          id: 'lu2',
          eventType: 'sub_in',
          eventNotes: startingLineupNote('ST'),
          timestamp: 0,
          createdAt: '2026-09-02T18:40:00.000Z',
        }),
        event({
          id: 'g-second',
          eventType: 'goal',
          playerId: 'p3',
          playerName: 'Bea Lopez',
          timestamp: 5 * 60,
          createdAt: '2026-09-02T18:45:00.000Z',
        }),
        event({
          id: 'g1',
          eventType: 'goal',
          playerId: 'p1',
          playerName: 'Ada Lopez',
          assistPlayerId: 'p2',
          assistPlayerName: 'Bess Chen',
          timestamp: 12 * 60 + 34,
          eventNotes: 'Short-range',
          createdAt: '2026-09-02T18:12:00.000Z',
        }),
        event({
          id: 'their-pk',
          eventType: 'opponent_goal',
          timestamp: 23 * 60,
          isPk: true,
          createdAt: '2026-09-02T18:23:00.000Z',
        }),
        event({
          id: 'shot',
          eventType: 'shot_home',
          timestamp: 400,
          createdAt: '2026-09-02T18:10:00.000Z',
        }),
      ],
      { periodLengthMinutes: 30, totalPeriods: 2, players },
    )

    expect(board.us.map((goal) => formatScoreboardGoalLine(goal))).toEqual([
      "A. Lopez 12' (Chen)",
      "B. Lopez 35'",
    ])
    expect(board.them.map((goal) => formatScoreboardGoalLine(goal))).toEqual(["23' (PK)"])
  })

  it('credits own goals without a scorer and skips a set-piece tag that is not a penalty', () => {
    const board = buildGoalScoreboard(
      [
        event({
          id: 'og-us',
          eventType: 'goal',
          eventNotes: 'Own Goal',
          playerId: 'p1',
          playerName: 'Ada Lopez',
          timestamp: 8 * 60,
          createdAt: '2026-09-02T18:08:00.000Z',
        }),
        event({
          id: 'og-them',
          eventType: 'opponent_goal',
          eventNotes: 'Own Goal',
          timestamp: 15 * 60,
          createdAt: '2026-09-02T18:15:00.000Z',
        }),
        event({
          id: 'set-piece',
          eventType: 'opponent_goal',
          eventNotes: 'Set Piece / PK',
          timestamp: 20 * 60,
          isPk: false,
          createdAt: '2026-09-02T18:20:00.000Z',
        }),
        event({
          id: 'our-pk',
          eventType: 'goal',
          eventNotes: 'PK',
          playerId: 'p2',
          assistPlayerId: 'p1',
          assistPlayerName: 'Ada Lopez',
          timestamp: 22 * 60,
          createdAt: '2026-09-02T18:40:00.000Z',
        }),
      ],
      { periodLengthMinutes: 30, players },
    )

    expect(board.us.map((goal) => formatScoreboardGoalLine(goal))).toEqual([
      "Own goal 8'",
      "Chen 22' (PK)",
    ])
    expect(board.them.map((goal) => formatScoreboardGoalLine(goal))).toEqual([
      "Own goal 15'",
      "20'",
    ])
  })

  it('returns nothing when the match had no goals', () => {
    expect(
      buildGoalScoreboard(
        [event({ id: 'shot', eventType: 'shot_home', timestamp: 90 })],
        { periodLengthMinutes: 30 },
      ),
    ).toEqual({ us: [], them: [] })
  })
})
