import { describe, expect, it } from 'vitest'
import {
  applyAvailabilityChange,
  includeInMatchRecord,
  parseAbsenceReason,
} from '@/lib/match-availability'
import type { MatchPlayer } from '@/types/match'

function player(overrides: Partial<MatchPlayer> & { id: string }): MatchPlayer {
  return {
    teamId: 't1',
    number: 7,
    firstName: 'A',
    lastName: 'B',
    position: 'ST',
    primaryPosition: 'ST',
    secondaryPosition: 'CM',
    ageGroup: 'U13',
    isGuest: false,
    activeStatus: true,
    impact: 'neutral',
    attending: true,
    isFirstHalfStarter: false,
    isSecondHalfStarter: false,
    isOnField: false,
    matchPosition: 'ST',
    totalSecondsPlayed: 0,
    subbedInAt: null,
    plusMinus: 0,
    yellowCardCount: 0,
    isSentOff: false,
    ...overrides,
  }
}

describe('applyAvailabilityChange', () => {
  it('puts an out player on the bench', () => {
    const next = applyAvailabilityChange(
      [player({ id: 'p1', attending: false, absenceReason: 'injured' })],
      'p1',
      { attending: true },
    )
    expect(next?.[0]).toMatchObject({
      attending: true,
      isOnField: false,
      absenceReason: null,
    })
  })

  it('marks a bench player out with a reason and keeps minutes', () => {
    const next = applyAvailabilityChange(
      [player({ id: 'p1', totalSecondsPlayed: 400 })],
      'p1',
      { attending: false, reason: 'left_early' },
    )
    expect(next?.[0]).toMatchObject({
      attending: false,
      isOnField: false,
      totalSecondsPlayed: 400,
      absenceReason: 'left_early',
    })
  })

  it('refuses to mark an on-field player out', () => {
    expect(
      applyAvailabilityChange([player({ id: 'p1', isOnField: true })], 'p1', {
        attending: false,
        reason: 'injured',
      }),
    ).toBeNull()
  })

  it('refuses to change a sent-off player', () => {
    expect(
      applyAvailabilityChange([player({ id: 'p1', isSentOff: true, attending: false })], 'p1', {
        attending: true,
      }),
    ).toBeNull()
  })
})

describe('includeInMatchRecord', () => {
  it('keeps players who played and then left', () => {
    expect(includeInMatchRecord({ attending: false, totalSecondsPlayed: 120 })).toBe(true)
  })

  it('skips players who were out the whole match', () => {
    expect(includeInMatchRecord({ attending: false, totalSecondsPlayed: 0 })).toBe(false)
  })
})

describe('parseAbsenceReason', () => {
  it('accepts the stored reasons', () => {
    expect(parseAbsenceReason('injured')).toBe('injured')
    expect(parseAbsenceReason('left_early')).toBe('left_early')
    expect(parseAbsenceReason('sick')).toBeNull()
  })
})
