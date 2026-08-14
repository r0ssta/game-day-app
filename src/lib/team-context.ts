/** Persisted active-team scope — extend for club/permission logic later. */
export type TeamScope = {
  teamId: string
  teamName: string
  /** Reserved for future RBAC (e.g. coach, admin, viewer). */
  accessRole?: string | null
  /** Reserved for future multi-club support. */
  clubId?: string | null
}

export type TeamSelectorOption = {
  id: string
  name: string
  clubId?: string | null
  accessRole?: string | null
}

export const ACTIVE_TEAM_STORAGE_KEY = 'game-day-active-team-id'

export function readPersistedActiveTeamId(): string | null {
  try {
    const value = localStorage.getItem(ACTIVE_TEAM_STORAGE_KEY)
    return value && value.trim().length > 0 ? value : null
  } catch {
    return null
  }
}

export function persistActiveTeamId(teamId: string | null) {
  try {
    if (!teamId) {
      localStorage.removeItem(ACTIVE_TEAM_STORAGE_KEY)
      return
    }
    localStorage.setItem(ACTIVE_TEAM_STORAGE_KEY, teamId)
  } catch {
    // Ignore storage failures (private mode, quota, etc.)
  }
}

export function resolveTeamScope(
  teamId: string | null,
  teams: Array<{ id: string; name: string; clubId?: string | null }>,
): TeamScope | null {
  if (!teamId) return null
  const team = teams.find((entry) => entry.id === teamId)
  if (!team) return null
  return {
    teamId: team.id,
    teamName: team.name,
    accessRole: null,
    clubId: team.clubId ?? null,
  }
}

/**
 * Teams available in the global switcher.
 * Archived teams are excluded; filter/sort hooks for club membership later.
 */
export function teamsForSelector(
  teams: Array<{ id: string; name: string; activeStatus?: boolean }>,
  _access?: { clubId?: string | null; roles?: string[] },
): TeamSelectorOption[] {
  return teams
    .filter((team) => team.activeStatus !== false)
    .map((team) => ({
      id: team.id,
      name: team.name,
      clubId: null,
      accessRole: null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
}
