import { describe, expect, it } from 'vitest'
import {
  getDefaultFormationId,
  getFormationById,
  reconcileSlotAssignments,
  resolveFormationIdForFormat,
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
