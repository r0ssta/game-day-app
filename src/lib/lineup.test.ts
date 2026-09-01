import { describe, expect, it } from 'vitest'
import {
  getMaxFieldPlayers,
  getSetupLineupBlockReason,
  hasSlotAssignments,
  isHalftimeLineupValid,
  isSetupLineupValid,
} from './lineup'
import type { SetupLineup } from '@/types/match'

function setup(attending: number, starters: number): SetupLineup {
  const attendingMap: Record<string, boolean> = {}
  const startFirstHalf: Record<string, boolean> = {}
  for (let index = 0; index < attending; index += 1) {
    const id = `p${index}`
    attendingMap[id] = true
    startFirstHalf[id] = index < starters
  }
  return { attending: attendingMap, startFirstHalf }
}

describe('lineup', () => {
  it('maps team format to max field players', () => {
    expect(getMaxFieldPlayers('7v7')).toBe(7)
    expect(getMaxFieldPlayers('9v9')).toBe(9)
    expect(getMaxFieldPlayers('11v11')).toBe(11)
  })

  it('blocks kickoff with zero attending players', () => {
    expect(getSetupLineupBlockReason(setup(0, 0), 9)).toBe(
      'Add at least one attending player to start.',
    )
    expect(isSetupLineupValid(setup(0, 0), 9)).toBe(false)
  })

  it('blocks too many first-half starters for the format', () => {
    const reason = getSetupLineupBlockReason(setup(12, 10), 9)
    expect(reason).toMatch(/Too many starters \(10\/9\)/)
    expect(isSetupLineupValid(setup(9, 9), 9)).toBe(true)
  })

  it('rejects a halftime XI that exceeds the format', () => {
    expect(isHalftimeLineupValid({ a: true, b: true, c: true }, 2)).toBe(false)
    expect(isHalftimeLineupValid({ a: true, b: true }, 2)).toBe(true)
  })

  it('treats empty and all-null slot maps as unassigned', () => {
    expect(hasSlotAssignments({})).toBe(false)
    expect(hasSlotAssignments({ gk: null, cm: null })).toBe(false)
    expect(hasSlotAssignments({ gk: 'player-1' })).toBe(true)
  })
})
