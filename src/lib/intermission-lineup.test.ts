import { describe, expect, it } from 'vitest'
import {
  intermissionLineupSignature,
  parseIntermissionLineup,
  readIntermissionLineup,
  withIntermissionLineup,
} from './intermission-lineup'

const lineup = {
  updatedAt: 10,
  endedPeriod: 1,
  formationId: '4-3-3',
  starters: { b: false, a: true },
  slotAssignments: { st: 'a', cm: null },
  slotLabelOverrides: { st: 'Striker' },
}

describe('intermission lineup', () => {
  it('reads a saved next-period pitch', () => {
    expect(parseIntermissionLineup(lineup)?.formationId).toBe('4-3-3')
    expect(readIntermissionLineup({ intermissionLineup: lineup })?.starters).toEqual({
      a: true,
      b: false,
    })
  })

  it('rejects a pitch without a period or formation', () => {
    expect(parseIntermissionLineup({ ...lineup, endedPeriod: 0 })).toBeNull()
    expect(parseIntermissionLineup({ ...lineup, formationId: ' ' })).toBeNull()
  })

  it('treats the same pitch as the same edit regardless of key order', () => {
    const flipped = {
      ...lineup,
      starters: { a: true, b: false },
      slotAssignments: { cm: null, st: 'a' },
    }
    expect(intermissionLineupSignature(lineup)).toBe(intermissionLineupSignature(flipped))
  })

  it('merges the pitch into qualitative context and can clear it', () => {
    const saved = withIntermissionLineup({ addedTimeSeconds: 0 }, lineup)
    expect(saved.addedTimeSeconds).toBe(0)
    expect(readIntermissionLineup(saved)?.updatedAt).toBe(10)
    expect(withIntermissionLineup(saved, null)).toEqual({ addedTimeSeconds: 0 })
  })
})