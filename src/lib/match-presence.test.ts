import { describe, expect, it } from 'vitest'
import {
  displayNameFromEmail,
  membersFromPresenceState,
  parsePresencePayload,
  staffInitials,
} from './match-presence'

describe('staffInitials', () => {
  it('uses first letters of the first two words', () => {
    expect(staffInitials('Kim Ehlers')).toBe('KE')
    expect(staffInitials('  ross gilmore  ')).toBe('RG')
  })

  it('falls back to two letters of a single name', () => {
    expect(staffInitials('Kim')).toBe('KI')
    expect(staffInitials('R')).toBe('R')
    expect(staffInitials('')).toBe('?')
  })
})

describe('parsePresencePayload', () => {
  it('rejects incomplete payloads', () => {
    expect(parsePresencePayload(null)).toBeNull()
    expect(parsePresencePayload({ userId: 'u1' })).toBeNull()
    expect(parsePresencePayload({ name: 'Kim' })).toBeNull()
  })

  it('fills initials when missing', () => {
    expect(parsePresencePayload({ userId: 'u1', name: 'Kim Ehlers' })).toEqual({
      userId: 'u1',
      name: 'Kim Ehlers',
      initials: 'KE',
    })
  })
})

describe('membersFromPresenceState', () => {
  it('excludes the local user and dedupes by userId', () => {
    const members = membersFromPresenceState(
      {
        local: [{ userId: 'me', name: 'Ross Gilmore', initials: 'RG', onlineAt: '1' }],
        other: [
          { userId: 'ke', name: 'Kim Ehlers', initials: 'KE', onlineAt: '1' },
          { userId: 'ke', name: 'Kim Ehlers', initials: 'KE', onlineAt: '2' },
        ],
      },
      'me',
    )
    expect(members).toEqual([{ userId: 'ke', name: 'Kim Ehlers', initials: 'KE' }])
  })
})

describe('displayNameFromEmail', () => {
  it('uses the local part of an email', () => {
    expect(displayNameFromEmail('kim.ehlers@example.com')).toBe('kim.ehlers')
    expect(displayNameFromEmail(null)).toBeNull()
  })
})
