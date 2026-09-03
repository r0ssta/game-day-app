import { describe, expect, it } from 'vitest'
import { startingLineupNote } from './match-event-notes'
import {
  buildParentTeamBoxScore,
  computeParentPeriodPlayedSeconds,
  formatParentSetupLengthLabel,
} from './parent-box-score'
import type { ParentLiveEvent } from './parent-hub'

function event(
  partial: Partial<ParentLiveEvent> & Pick<ParentLiveEvent, 'id' | 'eventType'>,
): ParentLiveEvent {
  return {
    matchId: 'm1',
    playerId: 'p1',
    playerName: 'Ada',
    jersey: 7,
    timestamp: 0,
    eventNotes: null,
    isPk: false,
    assistPlayerId: null,
    assistPlayerName: null,
    createdAt: '2026-09-02T18:00:00.000Z',
    ...partial,
  }
}

describe('formatParentSetupLengthLabel', () => {
  it('shows the coach setup minutes', () => {
    expect(formatParentSetupLengthLabel(30)).toBe('30 min')
    expect(formatParentSetupLengthLabel(18)).toBe('18 min')
  })
})

describe('buildParentTeamBoxScore', () => {
  it('splits goals, shots, corners, and saves by half and sums actual clock time', () => {
    const model = buildParentTeamBoxScore(
      [
        event({
          id: 'lu',
          eventType: 'sub_in',
          eventNotes: startingLineupNote('ST'),
          createdAt: '2026-09-02T18:00:00.000Z',
        }),
        event({
          id: 'g1',
          eventType: 'goal',
          timestamp: 200,
          createdAt: '2026-09-02T18:03:00.000Z',
        }),
        event({
          id: 'sh1',
          eventType: 'shot_home',
          timestamp: 210,
          createdAt: '2026-09-02T18:03:10.000Z',
        }),
        event({
          id: 'c1',
          eventType: 'corner_home',
          timestamp: 400,
          createdAt: '2026-09-02T18:06:00.000Z',
        }),
        event({
          id: 'end1',
          eventType: 'sub_out',
          timestamp: 1800,
          eventNotes: 'period_end',
          createdAt: '2026-09-02T18:30:00.000Z',
        }),
        event({
          id: 'lu2',
          eventType: 'sub_in',
          eventNotes: startingLineupNote('ST'),
          createdAt: '2026-09-02T18:40:00.000Z',
        }),
        event({
          id: 'og',
          eventType: 'opponent_goal',
          timestamp: 90,
          createdAt: '2026-09-02T18:41:30.000Z',
        }),
        event({
          id: 'sv',
          eventType: 'save_home',
          timestamp: 300,
          createdAt: '2026-09-02T18:45:00.000Z',
        }),
        event({
          id: 'g2',
          eventType: 'goal',
          timestamp: 900,
          createdAt: '2026-09-02T18:55:00.000Z',
        }),
        event({
          id: 'end2',
          eventType: 'sub_out',
          timestamp: 1770,
          eventNotes: 'period_end',
          createdAt: '2026-09-02T19:10:00.000Z',
        }),
      ],
      { halfLengthMinutes: 30, totalPeriods: 2 },
    )

    expect(model.setupLengthTitle).toBe('Half length')
    expect(model.setupLengthLabel).toBe('30 min')
    expect(model.periodLabels).toEqual(['1H', '2H'])
    expect(model.periods[0]).toMatchObject({
      homeGoals: 1,
      awayGoals: 0,
      homeShots: 1,
      homeCorners: 1,
      homeSaves: 0,
    })
    expect(model.periods[1]).toMatchObject({
      homeGoals: 1,
      awayGoals: 1,
      homeSaves: 1,
    })
    expect(model.total).toMatchObject({
      homeGoals: 2,
      awayGoals: 1,
      homeShots: 1,
      homeCorners: 1,
      homeSaves: 1,
    })
    expect(model.playedSeconds).toBe(3570)
    expect(model.playedLengthLabel).toBe('59:30')
    expect(model.hasStats).toBe(true)
  })

  it('counts unpaired shots as the other team’s saves', () => {
    const model = buildParentTeamBoxScore(
      [
        event({
          id: 's1',
          eventType: 'shot_home',
          timestamp: 100,
          createdAt: '2026-09-02T18:02:00.000Z',
        }),
        event({
          id: 's2',
          eventType: 'shot_home',
          timestamp: 200,
          createdAt: '2026-09-02T18:04:00.000Z',
        }),
        event({
          id: 's3',
          eventType: 'shot_home',
          timestamp: 300,
          createdAt: '2026-09-02T18:06:00.000Z',
        }),
        event({
          id: 'g1',
          eventType: 'goal',
          timestamp: 300,
          createdAt: '2026-09-02T18:06:00.050Z',
        }),
        event({
          id: 'sa',
          eventType: 'shot_away',
          timestamp: 400,
          createdAt: '2026-09-02T18:08:00.000Z',
        }),
      ],
      { halfLengthMinutes: 30, totalPeriods: 2 },
    )

    expect(model.total).toMatchObject({
      homeShots: 3,
      awayShots: 1,
      homeGoals: 1,
      awayGoals: 0,
      homeSaves: 1,
      awaySaves: 2,
    })
  })

  it('prefers period_end timestamps over a later sub-off in the same half', () => {
    const seconds = computeParentPeriodPlayedSeconds([
      event({
        id: 'lu',
        eventType: 'sub_in',
        eventNotes: startingLineupNote('LB'),
        createdAt: '2026-09-02T18:00:00.000Z',
      }),
      event({
        id: 'late-sub',
        eventType: 'sub_out',
        timestamp: 1900,
        createdAt: '2026-09-02T18:29:50.000Z',
      }),
      event({
        id: 'end',
        eventType: 'sub_out',
        timestamp: 1798,
        eventNotes: 'period_end',
        createdAt: '2026-09-02T18:30:00.000Z',
      }),
    ])
    expect(seconds).toEqual([1798])
  })
})
