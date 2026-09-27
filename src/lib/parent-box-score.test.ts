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

  it('adds the final period when full time was stamped at 0:00', () => {
    const seconds = computeParentPeriodPlayedSeconds([
      event({
        id: 'lu1',
        eventType: 'sub_in',
        eventNotes: startingLineupNote('ST'),
        createdAt: '2026-09-26T18:44:37.000Z',
      }),
      event({
        id: 'end1',
        eventType: 'sub_out',
        timestamp: 2106,
        eventNotes: 'period_end',
        createdAt: '2026-09-26T19:19:42.000Z',
      }),
      event({
        id: 'lu2',
        eventType: 'sub_in',
        eventNotes: startingLineupNote('ST'),
        createdAt: '2026-09-26T19:26:42.000Z',
      }),
      event({
        id: 'g2',
        eventType: 'goal',
        timestamp: 2020,
        createdAt: '2026-09-26T20:00:22.000Z',
      }),
      event({
        id: 'end2',
        eventType: 'sub_out',
        timestamp: 0,
        eventNotes: 'period_end',
        createdAt: '2026-09-26T20:01:30.000Z',
      }),
    ])
    // 1H whistle 2106s + 2H kickoff 19:26:42 through full time 20:01:30 (2088s)
    expect(seconds).toEqual([2106, 2088])

    const model = buildParentTeamBoxScore(
      [
        event({
          id: 'lu1',
          eventType: 'sub_in',
          eventNotes: startingLineupNote('ST'),
          createdAt: '2026-09-26T18:44:37.000Z',
        }),
        event({
          id: 'end1',
          eventType: 'sub_out',
          timestamp: 2106,
          eventNotes: 'period_end',
          createdAt: '2026-09-26T19:19:42.000Z',
        }),
        event({
          id: 'lu2',
          eventType: 'sub_in',
          eventNotes: startingLineupNote('ST'),
          createdAt: '2026-09-26T19:26:42.000Z',
        }),
        event({
          id: 'g2',
          eventType: 'goal',
          timestamp: 2020,
          createdAt: '2026-09-26T20:00:22.000Z',
        }),
        event({
          id: 'end2',
          eventType: 'sub_out',
          timestamp: 0,
          eventNotes: 'period_end',
          createdAt: '2026-09-26T20:01:30.000Z',
        }),
      ],
      { halfLengthMinutes: 35, totalPeriods: 2 },
    )
    expect(model.playedSeconds).toBe(2106 + 2088)
    expect(model.playedLengthLabel).toBe('69:54')
  })
})
