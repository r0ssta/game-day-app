export type PlayerNameFields = {
  id: string
  firstName: string
  lastName: string
}

export function formatPlayerFullName(firstName: string, lastName: string): string {
  const first = firstName.trim()
  const last = lastName.trim()
  if (!first) return last
  if (!last) return first
  return `${first} ${last}`
}

/** Split legacy single `name` column into first/last for migration fallbacks. */
export function parseLegacyPlayerName(name: string): { firstName: string; lastName: string } {
  const trimmed = name.trim()
  if (!trimmed) return { firstName: '', lastName: '' }
  const spaceIndex = trimmed.indexOf(' ')
  if (spaceIndex === -1) return { firstName: trimmed, lastName: '' }
  return {
    firstName: trimmed.slice(0, spaceIndex).trim(),
    lastName: trimmed.slice(spaceIndex + 1).trim(),
  }
}

export function resolvePlayerNameFields(
  player: {
    first_name?: string | null
    last_name?: string | null
    name?: string | null
  },
): { firstName: string; lastName: string } {
  const first = player.first_name?.trim()
  const last = player.last_name?.trim()
  if (first) {
    return { firstName: first, lastName: last ?? '' }
  }
  if (player.name?.trim()) {
    return parseLegacyPlayerName(player.name)
  }
  return { firstName: '', lastName: '' }
}

/**
 * Build sideline display names for a roster subset.
 * Shows first name only, unless multiple players share the same first name —
 * then appends last initial (e.g. "John S.").
 */
export function buildSidelineNameMap(players: PlayerNameFields[]): Map<string, string> {
  const firstNameCounts = new Map<string, number>()
  for (const player of players) {
    const key = player.firstName.trim().toLowerCase()
    if (!key) continue
    firstNameCounts.set(key, (firstNameCounts.get(key) ?? 0) + 1)
  }

  const result = new Map<string, string>()
  for (const player of players) {
    const first = player.firstName.trim()
    const last = player.lastName.trim()
    const key = first.toLowerCase()
    const needsInitial = (firstNameCounts.get(key) ?? 0) > 1
    const lastInitial = last.charAt(0).toUpperCase()

    if (!first) {
      result.set(player.id, last || 'Player')
      continue
    }

    result.set(
      player.id,
      needsInitial && lastInitial ? `${first} ${lastInitial}.` : first,
    )
  }
  return result
}

export function getSidelineName(
  player: PlayerNameFields,
  map: Map<string, string>,
): string {
  return map.get(player.id) ?? (player.firstName.trim() || formatPlayerFullName(player.firstName, player.lastName))
}

export function formatPlayerLabel(
  player: PlayerNameFields & { number: number | null },
  map?: Map<string, string>,
): string {
  const display = map ? getSidelineName(player, map) : formatPlayerFullName(player.firstName, player.lastName)
  return player.number !== null ? `#${player.number} ${display}` : display
}
