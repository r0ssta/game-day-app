import { describe, expect, it } from 'vitest'
import { aggregatePlayerRecaps, buildAbsoluteMatchTimeline } from './match-recap'
import type { DbMatchEvent } from '@/types/database'

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
})
