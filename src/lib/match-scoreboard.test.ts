import { describe, expect, it } from 'vitest'
import { startingLineupNote } from './match-event-notes'
import { buildMatchScoreboardGoals } from './match-scoreboard'
import type { ParentLiveEvent } from './parent-hub'

function event(
  partial: Partial<ParentLiveEvent> & Pick<ParentLiveEvent, 'id' | 'eventType'>,
): ParentLiveEvent {
  return {
    matchId: 'm1',
    playerId: 'p1',
    playerName: 'Ada',
    jersey: 7,
    timestamp: 120,
    eventNotes: null,
    isPk: false,
    assistPlayerId: null,
    assistPlayerName: null,
    createdAt: '2026-09-02T18:00:00.000Z',
    ...partial,
  }
}

describe('buildMatchScoreboardGoals', () => {
  it('groups one scorer’s goals in order and marks the penalty minute', () => {
    const goals = buildMatchScoreboardGoals(
      [
        event({
          id: 'g2',
          eventType: 'goal',
          playerId: 'p1',
          playerName: 'Ada',
          timestamp: 18 * 60,
          eventNotes: 'PK',
          isPk: true,
          createdAt: '2026-09-02T18:20:00.000Z',
        }),
        event({
          id: 'g1',
          eventType: 'goal',
          playerId: 'p1',
          playerName: 'Ada',
          timestamp: 10 * 60,
          createdAt: '2026-09-02T18:10:00.000Z',
        }),
        event({
          id: 'g3',
          eventType: 'goal',
          playerId: 'p1',
          playerName: 'Ada',
          timestamp: 19 * 60,
          createdAt: '2026-09-02T18:21:00.000Z',
        }),
      ],
      { teamName: 'U11 Blitz', opponent: 'Rivertown' },
    )

    expect(goals.us).toEqual([
      { key: 'us:p1', name: 'Ada', marks: ["1H 10'", "1H 18' Pen", "1H 19'"] },
    ])
    expect(goals.them).toEqual([])
  })

  it('orders scorers by their first goal and keeps a second-half clock', () => {
    const goals = buildMatchScoreboardGoals(
      [
        event({
          id: 'g-ada',
          eventType: 'goal',
          playerName: 'Ada',
          timestamp: 8 * 60,
          createdAt: '2026-09-02T18:08:00.000Z',
        }),
        event({
          id: 'kickoff-2',
          eventType: 'sub_in',
          playerName: 'Bea',
          timestamp: 0,
          eventNotes: startingLineupNote('ST'),
          createdAt: '2026-09-02T18:40:00.000Z',
        }),
        event({
          id: 'g-bea',
          eventType: 'goal',
          playerId: 'p2',
          playerName: 'Bea',
          timestamp: 7 * 60,
          createdAt: '2026-09-02T18:47:00.000Z',
        }),
        event({
          id: 'g-ada-2',
          eventType: 'goal',
          playerName: 'Ada',
          timestamp: 12 * 60,
          createdAt: '2026-09-02T18:52:00.000Z',
        }),
      ],
      { teamName: 'U11 Blitz', opponent: 'Rivertown' },
    )

    expect(goals.us.map((row) => ({ name: row.name, marks: row.marks }))).toEqual([
      { name: 'Ada', marks: ["1H 8'", "2H 12'"] },
      { name: 'Bea', marks: ["2H 7'"] },
    ])
  })

  it('credits an own goal to the team that scored, without a player name', () => {
    const goals = buildMatchScoreboardGoals(
      [
        event({
          id: 'og-us',
          eventType: 'goal',
          playerId: null,
          playerName: null,
          eventNotes: 'Own Goal',
          timestamp: 6 * 60,
          createdAt: '2026-09-02T18:06:00.000Z',
        }),
        event({
          id: 'og-them',
          eventType: 'opponent_goal',
          playerId: null,
          playerName: null,
          eventNotes: 'Own Goal',
          timestamp: 14 * 60,
          createdAt: '2026-09-02T18:14:00.000Z',
        }),
      ],
      { teamName: 'U11 Blitz', opponent: 'Rivertown' },
    )

    expect(goals.us).toEqual([{ key: 'us:og', name: 'Own Goal', marks: ["1H 6'"] }])
    expect(goals.them).toEqual([{ key: 'them:og', name: 'Own Goal', marks: ["1H 14'"] }])
  })

  it('lists opponent goals under the opponent when no scorer was tagged', () => {
    const goals = buildMatchScoreboardGoals(
      [
        event({
          id: 'them-1',
          eventType: 'opponent_goal',
          playerId: null,
          playerName: null,
          timestamp: 4 * 60,
          createdAt: '2026-09-02T18:04:00.000Z',
        }),
        event({
          id: 'them-2',
          eventType: 'opponent_goal',
          playerId: null,
          playerName: null,
          timestamp: 22 * 60,
          isPk: true,
          createdAt: '2026-09-02T18:22:00.000Z',
        }),
        event({
          id: 'shot',
          eventType: 'shot_home',
          timestamp: 90,
          createdAt: '2026-09-02T18:03:00.000Z',
        }),
      ],
      { teamName: 'U11 Blitz', opponent: 'Rivertown' },
    )

    expect(goals.us).toEqual([])
    expect(goals.them).toEqual([
      { key: 'them:team', name: 'Rivertown', marks: ["1H 4'", "1H 22' Pen"] },
    ])
  })

  it('uses the team name when our goal was not tagged to a player', () => {
    const goals = buildMatchScoreboardGoals(
      [
        event({
          id: 'untagged',
          eventType: 'goal',
          playerId: null,
          playerName: null,
          timestamp: 3 * 60,
          createdAt: '2026-09-02T18:03:00.000Z',
        }),
      ],
      { teamName: 'U11 Blitz', opponent: 'Rivertown' },
    )

    expect(goals.us).toEqual([{ key: 'us:untagged', name: 'U11 Blitz', marks: ["1H 3'"] }])
  })
})
