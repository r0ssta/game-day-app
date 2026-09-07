import { describe, expect, it } from 'vitest'
import {
  parsePreloadSlotAssignments,
  resolveLiveFirstHalfSlots,
  resolveSetupLineup,
} from './lineup-presets'
import type { SetupLineup } from '@/types/match'

function setup(starters: Record<string, boolean>): SetupLineup {
  const attending = Object.fromEntries(Object.keys(starters).map((id) => [id, true]))
  return { attending, startFirstHalf: starters }
}

describe('resolveSetupLineup', () => {
  it('keeps persisted starters when the pitch map is empty or all-null', () => {
    const persisted = setup({ a: true, b: false })
    expect(resolveSetupLineup(persisted, null)).toEqual(persisted)
    expect(resolveSetupLineup(persisted, {})).toEqual(persisted)
    expect(resolveSetupLineup(persisted, { gk: null, cm: null })).toEqual(persisted)
  })

  it('overwrites starters from a populated pitch map', () => {
    const persisted = setup({ a: true, b: false, c: false })
    expect(resolveSetupLineup(persisted, { gk: 'b', cm: 'c' }).startFirstHalf).toEqual({
      a: false,
      b: true,
      c: true,
    })
  })
})

describe('parsePreloadSlotAssignments', () => {
  it('returns null for missing or empty maps', () => {
    expect(parsePreloadSlotAssignments(null)).toBeNull()
    expect(parsePreloadSlotAssignments({})).toBeNull()
    expect(parsePreloadSlotAssignments({ gk: null })).toBeNull()
  })

  it('keeps assigned slot ids', () => {
    expect(parsePreloadSlotAssignments({ gk: 'p1', cm: '  p2  ', lw: null })).toEqual({
      gk: 'p1',
      cm: 'p2',
      lw: null,
    })
  })
})

describe('resolveLiveFirstHalfSlots', () => {
  it('prefers the persisted playerId → slotId map over label reconstruction', () => {
    const locked = resolveLiveFirstHalfSlots({
      persistedRaw: { 'fwd-l': 'p-st', 'fwd-c': 'p-lw', 'fwd-r': 'p-rw' },
      formationId: '3-2-3',
      format: '9v9',
      starters: [
        { playerId: 'p-st', position: 'ST' },
        { playerId: 'p-lw', position: 'LW' },
        { playerId: 'p-rw', position: 'RW' },
      ],
    })
    expect(locked?.['fwd-l']).toBe('p-st')
    expect(locked?.['fwd-c']).toBe('p-lw')
    expect(locked?.['fwd-r']).toBe('p-rw')
  })

  it('falls back to label matching when nothing was persisted', () => {
    const reconstructed = resolveLiveFirstHalfSlots({
      persistedRaw: null,
      formationId: '3-2-3',
      format: '9v9',
      starters: [
        { playerId: 'p-st', position: 'ST' },
        { playerId: 'p-lw', position: 'LW' },
        { playerId: 'p-rw', position: 'RW' },
      ],
    })
    expect(reconstructed?.['fwd-l']).toBe('p-lw')
    expect(reconstructed?.['fwd-c']).toBe('p-st')
    expect(reconstructed?.['fwd-r']).toBe('p-rw')
  })
})
