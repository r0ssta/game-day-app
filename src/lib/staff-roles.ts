export const STAFF_ROLES = ['director', 'head_coach', 'assistant_coach'] as const

export type StaffRole = (typeof STAFF_ROLES)[number]

export function isStaffRole(value: unknown): value is StaffRole {
  return typeof value === 'string' && (STAFF_ROLES as readonly string[]).includes(value)
}

export function canDeleteMatches(role: StaffRole | null | undefined): boolean {
  return role === 'director' || role === 'head_coach'
}

export function canUseSprocketIntegration(role: StaffRole | null | undefined): boolean {
  return role === 'director' || role === 'head_coach'
}

export function formatStaffRoleLabel(role: StaffRole): string {
  switch (role) {
    case 'director':
      return 'Director'
    case 'head_coach':
      return 'Head Coach'
    case 'assistant_coach':
      return 'Assistant Coach'
  }
}
