import { describe, expect, it } from 'vitest'
import type { DbMatchEvent } from '@/types/database'
import {
  applyPlusMinusDelta,
  computeMatchPlusMinus,
  formatPlusMinus,
} from './plus-minus'
import type { MatchPlayer } from '@/types/match'

const MATCH_ID = '00000000-0000-4000-8000-000000000001'
const ON_FIELD = '11111111-1111-4000-8000-000000000001'
const BENCH = '22222222-2222-4000-8000-000000000002'

function event(partial: Partial<DbMatchEvent> & Pick<DbMatchEvent, 'event_type'>): DbMatchEvent {
  return {
    id: partial.id ?? crypto.randomUUID(),
    match_id: MATCH_ID,
    player_id: null,
    timestamp: 10,
    event_notes: null,
    formation: '4-3-3',
    assist_player_id: null,
    pk_result: null,
    pk_team: null,
    created_at: '2026-01-01T00:00:00.000Z',
    ...partial,
  }
}

function player(partial: Partial<MatchPlayer> & Pick<MatchPlayer, 'id'>): MatchPlayer {
  return {
    teamId: 't',
    number: 7,
    firstName: 'Test',
    lastName: 'Player',
    position: 'CM',
    primaryPosition: 'CM',
    secondaryPosition: 'CAM',
    ageGroup: 'U13',
    isGuest: false,
    activeStatus: true,
    impact: 'neutral',
    attending: true,
    isFirstHalfStarter: true,
    isSecondHalfStarter: false,
    isOnField: false,
    matchPosition: 'CM',
    totalSecondsPlayed: 0,
    subbedInAt: null,
    plusMinus: 0,
    yellowCardCount: 0,
    isSentOff: false,
    ...partial,
  }
}

describe('plus-minus', () => {
  it('formats positives with a leading plus', () => {
    expect(formatPlusMinus(2)).toBe('+2')
    expect(formatPlusMinus(0)).toBe('0')
    expect(formatPlusMinus(-1)).toBe('-1')
  })

  it('credits on-field players for our goal and leaves the bench unchanged', () => {
    const ledger = computeMatchPlusMinus(
      [
        event({ event_type: 'sub_in', player_id: ON_FIELD, timestamp: 5, created_at: '2026-01-01T00:00:01.000Z' }),
        event({ event_type: 'goal', timestamp: 20, created_at: '2026-01-01T00:00:02.000Z' }),
      ],
      1800,
    )
    expect(ledger.get(ON_FIELD)).toBe(1)
    expect(ledger.has(BENCH)).toBe(false)
  })

  it('subtracts for opponent goals after a sub out', () => {
    const ledger = computeMatchPlusMinus(
      [
        event({ event_type: 'sub_in', player_id: ON_FIELD, timestamp: 5, created_at: '2026-01-01T00:00:01.000Z' }),
        event({ event_type: 'sub_in', player_id: BENCH, timestamp: 5, created_at: '2026-01-01T00:00:01.000Z' }),
        event({ event_type: 'sub_out', player_id: BENCH, timestamp: 40, created_at: '2026-01-01T00:00:02.000Z' }),
        event({ event_type: 'opponent_goal', timestamp: 50, created_at: '2026-01-01T00:00:03.000Z' }),
      ],
      1800,
    )
    expect(ledger.get(ON_FIELD)).toBe(-1)
    expect(ledger.has(BENCH)).toBe(false)
  })

  it('falls back to first-half starters when the match has no sub events', () => {
    const ledger = computeMatchPlusMinus(
      [event({ event_type: 'goal', timestamp: 30 })],
      1800,
      { firstHalfStarterIds: [ON_FIELD] },
    )
    expect(ledger.get(ON_FIELD)).toBe(1)
  })

  it('applyPlusMinusDelta only touches attending on-field players', () => {
    const players = [
      player({ id: ON_FIELD, isOnField: true, plusMinus: 0 }),
      player({ id: BENCH, isOnField: false, plusMinus: 0 }),
    ]
    const next = applyPlusMinusDelta(players, 1)
    expect(next.find((row) => row.id === ON_FIELD)?.plusMinus).toBe(1)
    expect(next.find((row) => row.id === BENCH)?.plusMinus).toBe(0)
  })
})
