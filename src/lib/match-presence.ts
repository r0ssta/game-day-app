/** Payload each staff client publishes on `match_presence:${matchId}`. */
export interface MatchPresenceState {
  userId: string
  name: string
  initials: string
  onlineAt: string
}

export type MatchPresenceMember = Pick<MatchPresenceState, 'userId' | 'name' | 'initials'>

export function staffInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length >= 2) {
    const first = parts[0]?.[0]
    const second = parts[1]?.[0]
    if (first && second) return `${first}${second}`.toUpperCase()
  }

  const letters = (parts[0] ?? '').replace(/[^A-Za-z]/g, '')
  if (letters.length >= 2) return letters.slice(0, 2).toUpperCase()
  if (letters.length === 1) return letters.toUpperCase()
  return '?'
}

export function displayNameFromEmail(email: string | null | undefined): string | null {
  const trimmed = email?.trim() ?? ''
  if (!trimmed) return null
  const local = trimmed.split('@')[0]?.trim()
  return local || trimmed
}

export function parsePresencePayload(raw: unknown): MatchPresenceMember | null {
  if (!raw || typeof raw !== 'object') return null
  const record = raw as Record<string, unknown>
  const userId = typeof record.userId === 'string' ? record.userId.trim() : ''
  const name = typeof record.name === 'string' ? record.name.trim() : ''
  if (!userId || !name) return null
  const initials =
    typeof record.initials === 'string' && record.initials.trim()
      ? record.initials.trim().slice(0, 3).toUpperCase()
      : staffInitials(name)
  return { userId, name, initials }
}

export function membersFromPresenceState(
  state: Record<string, readonly unknown[] | undefined>,
  localUserId: string,
): MatchPresenceMember[] {
  const byUser = new Map<string, MatchPresenceMember>()
  for (const metas of Object.values(state)) {
    if (!Array.isArray(metas)) continue
    for (const meta of metas) {
      const member = parsePresencePayload(meta)
      if (!member || member.userId === localUserId) continue
      if (!byUser.has(member.userId)) byUser.set(member.userId, member)
    }
  }
  return [...byUser.values()].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
  )
}
