import { describe, expect, it } from 'vitest'
import {
  buildAssignmentsFromStarters,
  getDefaultFormationId,
  getFormationById,
  reconcileSlotAssignments,
  remapFormationSlotAssignments,
  resolveFormationIdForFormat,
  type Formation,
} from './formations'

describe('resolveFormationIdForFormat', () => {
  it('keeps a formation that already matches the team format', () => {
    expect(resolveFormationIdForFormat('3-2-1', '7v7')).toBe('3-2-1')
    expect(resolveFormationIdForFormat('3-3-2', '9v9')).toBe('3-3-2')
  })

  it('replaces a 9v9 default with the 7v7 shape', () => {
    expect(resolveFormationIdForFormat('3-3-2', '7v7')).toBe(getDefaultFormationId('7v7'))
    expect(resolveFormationIdForFormat(undefined, '7v7')).toBe('2-3-1')
  })
})

describe('getFormationById', () => {
  it('does not render 9v9 slots on a 7v7 team', () => {
    const formation = getFormationById('3-3-2', '7v7')
    expect(formation.id).toBe('2-3-1')
    expect(formation.slots).toHaveLength(7)
  })
})

describe('reconcileSlotAssignments', () => {
  const sevenVseven = getFormationById('2-3-1', '7v7')

  it('maps leftover 9v9 keys onto empty 7v7 slots so two strikers are not dropped', () => {
    const assignments = {
      gk: 'p-gk',
      'def-l': 'p-lb',
      'def-r': 'p-rb',
      'mid-l': 'p-lm',
      'mid-c': 'p-cm',
      'fwd-l': 'p-st1',
      'fwd-r': 'p-st2',
    }
    const eligible = new Set(Object.values(assignments))
    const next = reconcileSlotAssignments(
      sevenVseven,
      assignments,
      [
        { id: 'p-gk', matchPosition: 'GK' },
        { id: 'p-lb', matchPosition: 'LB' },
        { id: 'p-rb', matchPosition: 'RB' },
        { id: 'p-lm', matchPosition: 'LM' },
        { id: 'p-cm', matchPosition: 'CM' },
        { id: 'p-st1', matchPosition: 'LF' },
        { id: 'p-st2', matchPosition: 'RF' },
      ],
      eligible,
    )

    const placed = Object.values(next).filter(Boolean)
    expect(placed).toHaveLength(7)
    expect(next.gk).toBe('p-gk')
    expect(next['mid-r']).toBeTruthy()
    expect(next.fwd).toBeTruthy()
    expect(placed).toEqual(expect.arrayContaining(['p-st1', 'p-st2']))
  })

  it('does not reshuffle players already sitting on valid slots', () => {
    const assignments = {
      gk: 'p-gk',
      'def-l': 'p-lb',
      'def-r': 'p-rb',
      'mid-l': 'p-lm',
      'mid-c': 'p-cm',
      'mid-r': 'p-rm',
      fwd: 'p-st',
    }
    const next = reconcileSlotAssignments(
      sevenVseven,
      assignments,
      Object.values(assignments).map((id) => ({ id, matchPosition: 'UTIL' })),
      new Set(Object.values(assignments)),
    )
    expect(next).toEqual(assignments)
  })
})

describe('buildAssignmentsFromStarters', () => {
  it('locks exact labels so a striker is not poured into the first forward slot', () => {
    const formation = getFormationById('3-2-3', '9v9')
    const players = [
      { id: 'p-gk', matchPosition: 'GK' },
      { id: 'p-st', matchPosition: 'ST' },
      { id: 'p-lw', matchPosition: 'LW' },
      { id: 'p-rw', matchPosition: 'RW' },
      { id: 'p-lcb', matchPosition: 'LCB' },
      { id: 'p-cb', matchPosition: 'CB' },
      { id: 'p-rcb', matchPosition: 'RCB' },
      { id: 'p-cdm', matchPosition: 'CDM' },
      { id: 'p-cam', matchPosition: 'CAM' },
    ]
    const starters = Object.fromEntries(players.map((p) => [p.id, true]))
    const next = buildAssignmentsFromStarters(formation, players, starters)

    expect(next['fwd-c']).toBe('p-st')
    expect(next['fwd-l']).toBe('p-lw')
    expect(next['fwd-r']).toBe('p-rw')
    expect(next['mid-l']).toBe('p-cdm')
    expect(next['mid-r']).toBe('p-cam')
  })

  it('does not move a player already locked onto a slot when filling leftovers', () => {
    const formation = getFormationById('2-3-1', '7v7')
    const players = [
      { id: 'p-gk', matchPosition: 'GK' },
      { id: 'p-lb', matchPosition: 'LB' },
      { id: 'p-rb', matchPosition: 'RB' },
      { id: 'p-lm', matchPosition: 'LM' },
      { id: 'p-cm', matchPosition: 'RM' },
      { id: 'p-rm', matchPosition: 'CM' },
      { id: 'p-st', matchPosition: 'ST' },
    ]
    const starters = Object.fromEntries(players.map((p) => [p.id, true]))
    const next = buildAssignmentsFromStarters(formation, players, starters)

    expect(next['mid-c']).toBe('p-rm')
    expect(next['mid-r']).toBe('p-cm')
  })
})

function placedLineup(formation: Formation) {
  const assignments: Record<string, string> = {}
  const players = formation.slots.map((slot) => {
    const id = `p-${slot.id}`
    assignments[slot.id] = id
    return { id, matchPosition: slot.label, position: slot.label }
  })
  return { assignments, players }
}

/** New slot id → slot id that player came from. */
function remapFromSlots(fromId: string, toId: string, format: Formation['format']) {
  const from = getFormationById(fromId, format)
  const to = getFormationById(toId, format)
  const { assignments, players } = placedLineup(from)
  const remap = remapFormationSlotAssignments(assignments, to, players, {
    fromFormation: from,
    mapSlotToPosition: (slot) => slot.label,
  })
  const fromSlotOfPlayer = new Map(from.slots.map((slot) => [`p-${slot.id}`, slot.id]))
  const placed: Record<string, string> = {}
  for (const slot of to.slots) {
    const playerId = remap.slotAssignments[slot.id]
    placed[slot.id] = playerId ? (fromSlotOfPlayer.get(playerId) ?? '') : ''
  }
  return { placed, remap, from, to }
}

function sideOf(x: number): 'L' | 'C' | 'R' {
  if (x <= 40) return 'L'
  if (x >= 60) return 'R'
  return 'C'
}

describe('remapFormationSlotAssignments', () => {
  it('drops the wingbacks into a back four and keeps everyone on their side', () => {
    const { placed } = remapFromSlots('3-5-2', '4-4-2', '11v11')

    expect(placed).toEqual({
      gk: 'gk',
      'def-lb': 'mid-lwb',
      'def-lcb': 'def-lcb',
      'def-rcb': 'def-rcb',
      'def-rb': 'mid-rwb',
      'mid-lm': 'mid-lcm',
      'mid-lcm': 'def-cb',
      'mid-rcm': 'mid-cdm',
      'mid-rm': 'mid-rcm',
      'fwd-ls': 'fwd-ls',
      'fwd-rs': 'fwd-rs',
    })
  })

  it('does not send a player from one wing to the other', () => {
    const switches: Array<[string, string, Formation['format']]> = [
      ['3-5-2', '4-4-2', '11v11'],
      ['4-4-2', '3-5-2', '11v11'],
      ['4-3-3', '4-4-2', '11v11'],
      ['4-4-2', '4-3-3', '11v11'],
      ['4-4-2', '4-5-1', '11v11'],
      ['4-5-1', '4-3-3', '11v11'],
      ['2-3-1', '3-2-1', '7v7'],
      ['3-2-1', '2-3-1', '7v7'],
      ['3-3-2', '4-3-1', '9v9'],
      ['4-3-1', '3-3-2', '9v9'],
      ['3-2-3', '3-3-2', '9v9'],
    ]

    for (const [fromId, toId, format] of switches) {
      const { placed, from, to } = remapFromSlots(fromId, toId, format)
      const fromById = new Map(from.slots.map((slot) => [slot.id, slot]))
      const toById = new Map(to.slots.map((slot) => [slot.id, slot]))

      expect(Object.values(placed).filter(Boolean)).toHaveLength(to.slots.length)

      for (const [toSlotId, fromSlotId] of Object.entries(placed)) {
        const before = fromById.get(fromSlotId)
        const after = toById.get(toSlotId)
        expect(before, `${fromId} → ${toId}`).toBeTruthy()
        expect(after, `${fromId} → ${toId}`).toBeTruthy()
        if (!before || !after) continue
        if (before.role === 'GK' || after.role === 'GK') {
          expect(after.role, `${before.label} left goal`).toBe('GK')
          continue
        }
        const beforeSide = sideOf(before.x)
        const afterSide = sideOf(after.x)
        expect(
          beforeSide === 'C' || afterSide === 'C' || beforeSide === afterSide,
          `${fromId} → ${toId}: ${before.label} (${before.x}) went to ${after.label} (${after.x})`,
        ).toBe(true)
      }
    }
  })

  it('leaves a shape unchanged when the formation does not change', () => {
    const { placed, from } = remapFromSlots('4-4-2', '4-4-2', '11v11')
    for (const slot of from.slots) {
      expect(placed[slot.id]).toBe(slot.id)
    }
  })

  it('names the new spot from where the player moved, including a wingback dropping to fullback', () => {
    const from = getFormationById('3-5-2', '11v11')
    const to = getFormationById('4-4-2', '11v11')
    const { assignments, players } = placedLineup(from)
    const remap = remapFormationSlotAssignments(assignments, to, players, {
      fromFormation: from,
      mapSlotToPosition: (slot) => slot.label,
    })

    const wingback = remap.positionUpdates.find((update) => update.playerId === 'p-mid-lwb')
    expect(wingback).toMatchObject({ position: 'LB', previousPosition: 'LWB' })
    expect(remap.overflowPlayerIds).toEqual([])
  })

  it('keeps a listed left back on the left when the previous shape is unknown', () => {
    const next = getFormationById('4-4-2', '11v11')
    const remap = remapFormationSlotAssignments(
      { old: 'p-lb', other: 'p-rb', goal: 'p-gk' },
      next,
      [
        { id: 'p-lb', matchPosition: 'LB' },
        { id: 'p-rb', matchPosition: 'RB' },
        { id: 'p-gk', matchPosition: 'GK' },
      ],
    )

    expect(remap.slotAssignments['def-lb']).toBe('p-lb')
    expect(remap.slotAssignments['def-rb']).toBe('p-rb')
    expect(remap.slotAssignments.gk).toBe('p-gk')
  })
})
