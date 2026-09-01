import { describe, expect, it } from 'vitest'
import { AUTOMATION_STAFF_EMAIL, isAutomationStaffEmail } from './automation-staff'

describe('isAutomationStaffEmail', () => {
  it('matches the e2e staff mailbox', () => {
    expect(isAutomationStaffEmail(AUTOMATION_STAFF_EMAIL)).toBe(true)
    expect(isAutomationStaffEmail(` ${AUTOMATION_STAFF_EMAIL.toUpperCase()} `)).toBe(true)
  })

  it('does not match real staff', () => {
    expect(isAutomationStaffEmail('ross@virginiavelocity.com')).toBe(false)
    expect(isAutomationStaffEmail(null)).toBe(false)
    expect(isAutomationStaffEmail('')).toBe(false)
  })
})
