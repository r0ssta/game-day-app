import { describe, expect, it } from 'vitest'
import {
  canAccessClubAdmin,
  canAccessPlatformAdmin,
  isActiveStaffUser,
} from './staff-roles'

describe('staff-roles club access', () => {
  it('gates Club Admin on the current club director role', () => {
    expect(canAccessClubAdmin('director')).toBe(true)
    expect(canAccessClubAdmin('coach')).toBe(false)
    expect(canAccessClubAdmin('pending')).toBe(false)
    expect(canAccessClubAdmin(null)).toBe(false)
  })

  it('gates Platform Admin on the platform flag, not club director', () => {
    expect(canAccessPlatformAdmin(true)).toBe(true)
    expect(canAccessPlatformAdmin(false)).toBe(false)
    expect(canAccessPlatformAdmin(null)).toBe(false)
  })

  it('lets platform admins into the app even without a club role', () => {
    expect(isActiveStaffUser(null, true)).toBe(true)
    expect(isActiveStaffUser('pending', true)).toBe(true)
    expect(isActiveStaffUser('pending', false)).toBe(false)
    expect(isActiveStaffUser('coach', false)).toBe(true)
  })
})
