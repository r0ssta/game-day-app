/** App-level access (Club Admin / overall staff). */
export const APP_ROLES = ['director', 'coach', 'pending'] as const
export type AppRole = (typeof APP_ROLES)[number]

/** Active app roles that can use the coaching app (not pending). */
export const ACTIVE_APP_ROLES = ['director', 'coach'] as const
export type ActiveAppRole = (typeof ACTIVE_APP_ROLES)[number]

/** Assignable app roles in Club Admin (Director | Staff). */
export const ASSIGNABLE_APP_ROLES = ['director', 'coach'] as const
export type AssignableAppRole = (typeof ASSIGNABLE_APP_ROLES)[number]

/** Per-team coaching role on team_members. */
export const TEAM_ROLES = ['head_coach', 'assistant_coach'] as const
export type TeamRole = (typeof TEAM_ROLES)[number]

/** @deprecated Use AppRole — kept for gradual rename of local vars. */
export type StaffRole = AppRole

export function isAppRole(value: unknown): value is AppRole {
  return typeof value === 'string' && (APP_ROLES as readonly string[]).includes(value)
}

export function isActiveAppRole(value: unknown): value is ActiveAppRole {
  return typeof value === 'string' && (ACTIVE_APP_ROLES as readonly string[]).includes(value)
}

export function isAssignableAppRole(value: unknown): value is AssignableAppRole {
  return typeof value === 'string' && (ASSIGNABLE_APP_ROLES as readonly string[]).includes(value)
}

export function isTeamRole(value: unknown): value is TeamRole {
  return typeof value === 'string' && (TEAM_ROLES as readonly string[]).includes(value)
}

/** @deprecated Use isAppRole */
export function isStaffRole(value: unknown): value is AppRole {
  return isAppRole(value)
}

/** @deprecated Use isActiveAppRole */
export function isActiveStaffRole(value: unknown): value is ActiveAppRole {
  return isActiveAppRole(value)
}

/** @deprecated Use isAssignableAppRole */
export function isAssignableStaffRole(value: unknown): value is AssignableAppRole {
  return isAssignableAppRole(value)
}

export function canAccessClubAdmin(appRole: AppRole | null | undefined): boolean {
  return appRole === 'director'
}

/**
 * Destructive / admin actions for a team (delete match, Sprocket, etc.).
 * Global directors always; otherwise requires head_coach on that team.
 */
export function canManageTeam(
  appRole: AppRole | null | undefined,
  teamRole: TeamRole | null | undefined,
): boolean {
  if (appRole === 'director') return true
  return teamRole === 'head_coach'
}

export function canDeleteMatches(
  appRole: AppRole | null | undefined,
  teamRole?: TeamRole | null,
): boolean {
  return canManageTeam(appRole, teamRole ?? null)
}

export function canUseSprocketIntegration(
  appRole: AppRole | null | undefined,
  teamRole?: TeamRole | null,
): boolean {
  return canManageTeam(appRole, teamRole ?? null)
}

export function formatAppRoleLabel(role: AppRole): string {
  switch (role) {
    case 'director':
      return 'Director'
    case 'coach':
      return 'Staff'
    case 'pending':
      return 'Pending Access'
  }
}

export function formatTeamRoleLabel(role: TeamRole): string {
  switch (role) {
    case 'head_coach':
      return 'Head Coach'
    case 'assistant_coach':
      return 'Assistant Coach'
  }
}

/** @deprecated Use formatAppRoleLabel */
export function formatStaffRoleLabel(role: AppRole): string {
  return formatAppRoleLabel(role)
}

/** Legacy assignable union — maps old invite roles away from app roles. */
export const ASSIGNABLE_STAFF_ROLES = ASSIGNABLE_APP_ROLES
export type AssignableStaffRole = AssignableAppRole
export const ACTIVE_STAFF_ROLES = ACTIVE_APP_ROLES
export type ActiveStaffRole = ActiveAppRole
export const STAFF_ROLES = APP_ROLES
