import { describe, expect, it } from 'vitest'
import {
  aggregatePlayerRecaps,
  buildAbsoluteMatchTimeline,
  buildRecapRows,
  resolveRecapRoleSeconds,
} from './match-recap'
import type { DbMatchEvent } from '@/types/database'
import type { MatchPlayer } from '@/types/match'

function event(
  overrides: Partial<DbMatchEvent> &
    Pick<DbMatchEvent, 'event_type' | 'timestamp' | 'created_at'>,
): DbMatchEvent {
  return {
    id: overrides.id ?? overrides.created_at,
    match_id: 'm1',
    player_id: overrides.player_id ?? 'p1',
    event_type: overrides.event_type,
    timestamp: overrides.timestamp,
    event_notes: overrides.event_notes ?? null,
    formation: null,
    assist_player_id: null,
    created_at: overrides.created_at,
    is_pk: false,
    pk_result: null,
    pk_team: null,
  }
}

describe('buildAbsoluteMatchTimeline', () => {
  it('rebases a half that kicked off after the countdown had already expired', () => {
    const timeline = buildAbsoluteMatchTimeline(
      [
        event({
          event_type: 'sub_in',
          timestamp: 0,
          event_notes: 'starting_lineup|GK',
          created_at: '2026-09-06T12:31:11.000Z',
        }),
        event({
          event_type: 'sub_out',
          timestamp: 1804,
          created_at: '2026-09-06T12:31:13.000Z',
          player_id: 'p1',
        }),
        event({
          event_type: 'sub_in',
          timestamp: 1804,
          event_notes: 'LWB',
          created_at: '2026-09-06T12:31:13.000Z',
          player_id: 'p2',
        }),
        event({
          event_type: 'sub_out',
          timestamp: 3302,
          event_notes: 'period_end',
          created_at: '2026-09-06T12:56:17.000Z',
          player_id: 'p2',
        }),
      ],
      30 * 60,
    )

    expect(timeline[0]?.absTimestamp).toBe(0)
    expect(timeline[1]?.absTimestamp).toBe(2)
    expect(timeline[3]?.absTimestamp).toBe(1500)
  })

  it('keeps a normal 25-minute half that ran 90 seconds of added time', () => {
    const timeline = buildAbsoluteMatchTimeline(
      [
        event({
          event_type: 'sub_in',
          timestamp: 0,
          event_notes: 'starting_lineup|GK',
          created_at: '2026-09-06T16:59:46.000Z',
        }),
        event({
          event_type: 'sub_out',
          timestamp: 1590,
          event_notes: 'period_end',
          created_at: '2026-09-06T17:26:21.000Z',
        }),
      ],
      25 * 60,
    )

    expect(timeline[0]?.absTimestamp).toBe(0)
    expect(timeline[1]?.absTimestamp).toBe(1590)
  })

  it('keeps mid-period clock rewinds in the same period', () => {
    const period = 18 * 60
    const timeline = buildAbsoluteMatchTimeline(
      [
        event({
          event_type: 'sub_in',
          timestamp: 0,
          event_notes: 'starting_lineup|ST',
          created_at: '2026-09-12T15:22:46.000Z',
        }),
        event({
          event_type: 'sub_out',
          timestamp: 317,
          created_at: '2026-09-12T15:28:05.000Z',
          player_id: 'p2',
        }),
        event({
          event_type: 'shot_away',
          timestamp: 140,
          created_at: '2026-09-12T15:28:37.000Z',
          player_id: null,
        }),
        event({
          event_type: 'sub_in',
          timestamp: 817,
          event_notes: 'RCB',
          created_at: '2026-09-12T15:36:28.000Z',
          player_id: 'p2',
        }),
        event({
          event_type: 'goal',
          timestamp: 173,
          created_at: '2026-09-12T15:36:49.000Z',
        }),
        event({
          event_type: 'sub_out',
          timestamp: 1075,
          event_notes: 'period_end',
          created_at: '2026-09-12T15:40:47.000Z',
        }),
      ],
      period,
    )

    expect(timeline.every((row) => row.periodIndex === 0)).toBe(true)
    expect(timeline.at(-1)?.absTimestamp).toBe(1075)
  })
})

describe('aggregatePlayerRecaps', () => {
  it('does not credit a full half for a 2-second opening sub after a 0:00 kickoff', () => {
    const stats = aggregatePlayerRecaps(
      [
        event({
          event_type: 'sub_in',
          timestamp: 0,
          event_notes: 'starting_lineup|ST',
          created_at: '2026-09-06T12:31:11.000Z',
          player_id: 'p1',
        }),
        event({
          event_type: 'sub_out',
          timestamp: 1804,
          created_at: '2026-09-06T12:31:13.000Z',
          player_id: 'p1',
        }),
        event({
          event_type: 'sub_in',
          timestamp: 1804,
          event_notes: 'ST',
          created_at: '2026-09-06T12:31:13.000Z',
          player_id: 'p2',
        }),
        event({
          event_type: 'sub_out',
          timestamp: 3302,
          event_notes: 'period_end',
          created_at: '2026-09-06T12:56:17.000Z',
          player_id: 'p2',
        }),
      ],
      30 * 60,
    )

    expect(stats.get('p1')?.totalSeconds).toBe(2)
    expect(stats.get('p2')?.totalSeconds).toBe(1498)
  })

  it('splits field and GK seconds when a player rotates into net', () => {
    const stats = aggregatePlayerRecaps(
      [
        event({
          event_type: 'sub_in',
          timestamp: 0,
          event_notes: 'starting_lineup|ST',
          created_at: '2026-09-06T16:00:00.000Z',
          player_id: 'p1',
        }),
        event({
          event_type: 'position_change',
          timestamp: 600,
          event_notes: 'ST→GK',
          created_at: '2026-09-06T16:10:00.000Z',
          player_id: 'p1',
        }),
        event({
          event_type: 'sub_out',
          timestamp: 1500,
          event_notes: 'period_end',
          created_at: '2026-09-06T16:25:00.000Z',
          player_id: 'p1',
        }),
      ],
      25 * 60,
    )

    expect(stats.get('p1')?.fieldSeconds).toBe(600)
    expect(stats.get('p1')?.gkSeconds).toBe(900)
    expect(stats.get('p1')?.totalSeconds).toBe(1500)
  })

  it('counts untagged starting stints as GK when the player finished in net', () => {
    const stats = aggregatePlayerRecaps(
      [
        event({
          event_type: 'sub_in',
          timestamp: 0,
          event_notes: 'starting_lineup',
          created_at: '2026-09-06T16:00:00.000Z',
          player_id: 'p1',
        }),
        event({
          event_type: 'sub_out',
          timestamp: 1500,
          event_notes: 'period_end',
          created_at: '2026-09-06T16:25:00.000Z',
          player_id: 'p1',
        }),
      ],
      25 * 60,
      new Map([['p1', { matchPosition: 'GK' }]]),
    )

    expect(stats.get('p1')?.gkSeconds).toBe(1500)
    expect(stats.get('p1')?.fieldSeconds).toBe(0)
  })

  it('sums all three U9/U10 periods instead of stopping after two halves', () => {
    const period = 18 * 60
    const stats = aggregatePlayerRecaps(
      [
        event({
          event_type: 'sub_in',
          timestamp: 0,
          event_notes: 'starting_lineup|ST',
          created_at: '2026-09-12T15:01:32.000Z',
          player_id: 'p1',
        }),
        event({
          event_type: 'sub_out',
          timestamp: period,
          event_notes: 'period_end',
          created_at: '2026-09-12T15:19:32.000Z',
          player_id: 'p1',
        }),
        event({
          event_type: 'sub_in',
          timestamp: 0,
          event_notes: 'starting_lineup|CM',
          created_at: '2026-09-12T15:22:46.000Z',
          player_id: 'p1',
        }),
        event({
          event_type: 'sub_out',
          timestamp: period,
          event_notes: 'period_end',
          created_at: '2026-09-12T15:40:46.000Z',
          player_id: 'p1',
        }),
        event({
          event_type: 'sub_in',
          timestamp: 0,
          event_notes: 'starting_lineup|ST',
          created_at: '2026-09-12T15:45:21.000Z',
          player_id: 'p1',
        }),
        event({
          event_type: 'sub_out',
          timestamp: period,
          event_notes: 'period_end',
          created_at: '2026-09-12T16:03:21.000Z',
          player_id: 'p1',
        }),
      ],
      period,
    )

    expect(stats.get('p1')?.totalSeconds).toBe(period * 3)
  })

  it('does not add a full period when the clock is rewound mid-period', () => {
    const period = 18 * 60
    const stats = aggregatePlayerRecaps(
      [
        event({
          event_type: 'sub_in',
          timestamp: 0,
          event_notes: 'starting_lineup|ST',
          created_at: '2026-09-12T15:22:46.000Z',
        }),
        event({
          event_type: 'sub_out',
          timestamp: 317,
          created_at: '2026-09-12T15:28:05.000Z',
          player_id: 'p2',
        }),
        event({
          event_type: 'shot_away',
          timestamp: 140,
          created_at: '2026-09-12T15:28:37.000Z',
          player_id: null,
        }),
        event({
          event_type: 'sub_in',
          timestamp: 817,
          event_notes: 'RCB',
          created_at: '2026-09-12T15:36:28.000Z',
          player_id: 'p2',
        }),
        event({
          event_type: 'goal',
          timestamp: 173,
          created_at: '2026-09-12T15:36:49.000Z',
        }),
        event({
          event_type: 'sub_out',
          timestamp: 1075,
          event_notes: 'period_end',
          created_at: '2026-09-12T15:40:47.000Z',
        }),
        event({
          event_type: 'sub_in',
          timestamp: 0,
          event_notes: 'starting_lineup|ST',
          created_at: '2026-09-12T15:45:21.000Z',
        }),
        event({
          event_type: 'sub_out',
          timestamp: period,
          event_notes: 'period_end',
          created_at: '2026-09-12T16:03:21.000Z',
        }),
      ],
      period,
    )

    expect(stats.get('p1')?.totalSeconds).toBe(1075 + period)
    expect(stats.get('p1')?.totalSeconds).toBeLessThanOrEqual(period * 2)
  })

  it('banks the previous period when kickoff overwrites an open stint', () => {
    const period = 18 * 60
    const stats = aggregatePlayerRecaps(
      [
        event({
          event_type: 'sub_in',
          timestamp: 0,
          event_notes: 'starting_lineup|ST',
          created_at: '2026-09-12T15:01:32.000Z',
        }),
        event({
          event_type: 'goal',
          timestamp: 1000,
          created_at: '2026-09-12T15:18:12.000Z',
        }),
        event({
          event_type: 'sub_in',
          timestamp: 0,
          event_notes: 'starting_lineup|CM',
          created_at: '2026-09-12T15:22:46.000Z',
        }),
        event({
          event_type: 'sub_out',
          timestamp: period,
          event_notes: 'period_end',
          created_at: '2026-09-12T15:40:46.000Z',
        }),
      ],
      period,
    )

    expect(stats.get('p1')?.totalSeconds).toBe(1000 + period)
  })
})

function recapPlayer(
  partial: Partial<MatchPlayer> & Pick<MatchPlayer, 'id'>,
): MatchPlayer {
  return {
    teamId: 't',
    number: 1,
    firstName: 'Ada',
    lastName: 'Net',
    position: 'GK',
    primaryPosition: 'Goalkeeper',
    secondaryPosition: 'Goalkeeper',
    ageGroup: 'U11',
    isGuest: false,
    activeStatus: true,
    impact: 'neutral',
    attending: true,
    isFirstHalfStarter: true,
    isSecondHalfStarter: true,
    isOnField: false,
    matchPosition: 'GK',
    totalSecondsPlayed: 0,
    subbedInAt: null,
    plusMinus: 0,
    yellowCardCount: 0,
    isSentOff: false,
    ...partial,
  }
}

describe('resolveRecapRoleSeconds', () => {
  it('keeps event GK time when the timeline already split roles', () => {
    expect(
      resolveRecapRoleSeconds(
        {
          playerId: 'p1',
          totalSeconds: 1500,
          fieldSeconds: 600,
          gkSeconds: 900,
          positions: ['ST', 'GK'],
          goals: 0,
          assists: 0,
          saves: 0,
          yellowCards: 0,
          redCards: 0,
        },
        recapPlayer({
          id: 'p1',
          matchPosition: 'ST',
          totalSecondsPlayed: 1500,
          fieldSecondsPlayed: 1500,
          gkSecondsPlayed: 0,
        }),
      ),
    ).toEqual({ totalSeconds: 1500, fieldSeconds: 600, gkSeconds: 900 })
  })

  it('uses live banked minutes when events missed the GK split', () => {
    expect(
      resolveRecapRoleSeconds(
        {
          playerId: 'p1',
          totalSeconds: 1500,
          fieldSeconds: 1500,
          gkSeconds: 0,
          positions: ['ST', 'GK'],
          goals: 0,
          assists: 0,
          saves: 0,
          yellowCards: 0,
          redCards: 0,
        },
        recapPlayer({
          id: 'p1',
          matchPosition: 'GK',
          totalSecondsPlayed: 1500,
          fieldSecondsPlayed: 600,
          gkSecondsPlayed: 900,
        }),
      ),
    ).toEqual({ totalSeconds: 1500, fieldSeconds: 600, gkSeconds: 900 })
  })
})

describe('buildRecapRows', () => {
  it('shows GK minutes on the recap row from live banked time', () => {
    const rows = buildRecapRows(
      [
        recapPlayer({
          id: 'p1',
          totalSecondsPlayed: 1500,
          fieldSecondsPlayed: 600,
          gkSecondsPlayed: 900,
        }),
      ],
      new Map([
        [
          'p1',
          {
            playerId: 'p1',
            totalSeconds: 1500,
            fieldSeconds: 1500,
            gkSeconds: 0,
            positions: ['GK'],
            goals: 0,
            assists: 0,
            saves: 2,
            yellowCards: 0,
            redCards: 0,
          },
        ],
      ]),
      new Map(),
    )

    expect(rows[0]?.gkSeconds).toBe(900)
    expect(rows[0]?.fieldSeconds).toBe(600)
  })
})
