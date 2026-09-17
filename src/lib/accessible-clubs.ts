import type { AppRole } from '@/lib/staff-roles'

export type AccessibleClub = {
  id: string
  name: string
  slug: string
}

export function mergeAccessibleClubs(
  memberships: Array<{ clubId: string; clubName: string; clubSlug: string }>,
  allClubs: AccessibleClub[],
): AccessibleClub[] {
  const byId = new Map<string, AccessibleClub>()
  for (const club of allClubs) {
    byId.set(club.id, { id: club.id, name: club.name, slug: club.slug })
  }
  for (const row of memberships) {
    if (byId.has(row.clubId)) continue
    byId.set(row.clubId, {
      id: row.clubId,
      name: row.clubName,
      slug: row.clubSlug,
    })
  }
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name))
}

export function resolveAccessibleClubId(
  clubs: AccessibleClub[],
  options?: { preferredClubId?: string | null; persistedClubId?: string | null },
): string | null {
  if (clubs.length === 0) return null
  const preferred = options?.preferredClubId
  if (preferred && clubs.some((club) => club.id === preferred)) return preferred
  const persisted = options?.persistedClubId
  if (persisted && clubs.some((club) => club.id === persisted)) return persisted
  return clubs.find((club) => club.slug === 'virginia-velocity')?.id ?? clubs[0]?.id ?? null
}

export function resolveClubAppRole(
  memberships: Array<{ clubId: string; appRole: AppRole }>,
  clubId: string | null,
  isAdmin: boolean,
): AppRole | null {
  if (clubId) {
    const membership = memberships.find((row) => row.clubId === clubId)
    if (membership) return membership.appRole
    if (isAdmin) return 'director'
  }
  if (isAdmin) return 'director'
  return memberships.length === 0 ? 'pending' : null
}
