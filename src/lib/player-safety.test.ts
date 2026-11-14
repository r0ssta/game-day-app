import { describe, expect, it } from 'vitest'
import { hasSafetyDetails, isUnavailableOn } from './player-safety'

describe('player safety', () => {
  it('blocks lineup selection before the return date', () => {
    expect(isUnavailableOn('2026-10-28', '2026-10-24')).toBe(true)
    expect(isUnavailableOn('2026-10-28', '2026-10-28')).toBe(false)
    expect(isUnavailableOn(null, '2026-10-24')).toBe(false)
  })

  it('treats a card with only a return date as worth showing', () => {
    expect(
      hasSafetyDetails({
        emergencyContactName: '',
        emergencyContactPhone: '',
        allergies: '',
        medicalNotes: '',
        unavailableUntil: '2026-10-28',
      }),
    ).toBe(true)
    expect(
      hasSafetyDetails({
        emergencyContactName: '  ',
        emergencyContactPhone: '',
        allergies: '',
        medicalNotes: '',
        unavailableUntil: null,
      }),
    ).toBe(false)
  })
})
