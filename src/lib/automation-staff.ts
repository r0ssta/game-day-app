/** Dedicated Playwright staff login — keep team access, hide from coach pickers. */
export const AUTOMATION_STAFF_EMAIL = 'gameday-e2e@virginiavelocity.com'

export function isAutomationStaffEmail(email: string | null | undefined): boolean {
  return (email ?? '').trim().toLowerCase() === AUTOMATION_STAFF_EMAIL
}
