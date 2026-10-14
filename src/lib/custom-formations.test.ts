import { describe, expect, it } from 'vitest'
import { getFormationById, setActiveCustomFormations, type FormationSlot } from './formations'
import {
  formationFromRow,
  formationSlotsForSave,
  normalizeFormationName,
  parseFormationSlots,
} from './custom-formations'

const slots: FormationSlot[] = [
  { id: 'gk', role: 'GK', label: 'GK', x: 50, y: 90 },
  { id: 'def-l', role: 'DEF', label: 'LB', x: 30, y: 70 },
  { id: 'def-r', role: 'DEF', label: 'RB', x: 70, y: 70 },
  { id: 'mid-l', role: 'MID', label: 'CM', x: 35, y: 48 },
  { id: 'mid-c', role: 'MID', label: 'CDM', x: 50, y: 52 },
  { id: 'mid-r', role: 'MID', label: 'CM', x: 65, y: 48 },
  { id: 'fwd', role: 'FWD', label: 'ST', x: 50, y: 24 },
]

describe('custom formations', () => {
  it('keeps a custom position name and uppercases a known code', () => {
    const saved = formationSlotsForSave(slots, { 'mid-l': 'winger', 'mid-c': 'cam' })
    expect(saved.find((slot) => slot.id === 'mid-l')?.label).toBe('winger')
    expect(saved.find((slot) => slot.id === 'mid-c')?.label).toBe('CAM')
  })

  it('rejects a shape that does not match the format', () => {
    expect(parseFormationSlots(slots, '9v9')).toBeNull()
    expect(parseFormationSlots(slots, '7v7')).toHaveLength(7)
  })

  it('trims the formation name', () => {
    expect(normalizeFormationName('  Wide 4-3-3  ')).toBe('Wide 4-3-3')
  })

  it('resolves a saved shape by id once it is loaded', () => {
    const formation = formationFromRow({
      id: '11111111-1111-4111-8111-111111111111',
      name: 'Wide',
      format: '7v7',
      slots,
    })
    expect(formation?.label).toBe('Wide')
    setActiveCustomFormations(formation ? [formation] : [], true)
    expect(getFormationById(formation!.id, '7v7').label).toBe('Wide')
    setActiveCustomFormations([], true)
  })
})
