export const STAFF_ROLES = ['director', 'head_coach', 'assistant_coach', 'pending'] as const

export type StaffRole = (typeof STAFF_ROLES)[number]

/** Roles that can use coaching features (not pending / revoked). */
export const ACTIVE_STAFF_ROLES = ['director', 'head_coach', 'assistant_coach'] as const

export type ActiveStaffRole = (typeof ACTIVE_STAFF_ROLES)[number]

export const ASSIGNABLE_STAFF_ROLES = ['director', 'head_coach', 'assistant_coach'] as const

export type AssignableStaffRole = (typeof ASSIGNABLE_STAFF_ROLES)[number]

export function isStaffRole(value: unknown): value is StaffRole {
  return typeof value === 'string' && (STAFF_ROLES as readonly string[]).includes(value)
}

export function isActiveStaffRole(value: unknown): value is ActiveStaffRole {
  return typeof value === 'string' && (ACTIVE_STAFF_ROLES as readonly string[]).includes(value)
}

export function isAssignableStaffRole(value: unknown): value is AssignableStaffRole {
  return typeof value === 'string' && (ASSIGNABLE_STAFF_ROLES as readonly string[]).includes(value)
}

export function canDeleteMatches(role: StaffRole | null | undefined): boolean {
  return role === 'director' || role === 'head_coach'
}

export function canUseSprocketIntegration(role: StaffRole | null | undefined): boolean {
  return role === 'director' || role === 'head_coach'
}

export function canAccessClubAdmin(role: StaffRole | null | undefined): boolean {
  return role === 'director'
}

export function formatStaffRoleLabel(role: StaffRole): string {
  switch (role) {
    case 'director':
      return 'Director'
    case 'head_coach':
      return 'Head Coach'
    case 'assistant_coach':
      return 'Assistant Coach'
    case 'pending':
      return 'Pending Access'
  }
}
