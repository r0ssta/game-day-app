export type LocationType = 'home' | 'away'

export function normalizeLocationType(value: string | null | undefined): LocationType {
  return value?.trim().toLowerCase() === 'away' ? 'away' : 'home'
}

export function resolveMatchLocationType(match: {
  location_type?: string | null
  location?: string | null
}): LocationType {
  if (match.location_type?.trim()) {
    return normalizeLocationType(match.location_type)
  }
  return normalizeLocationType(match.location)
}

export function formatVenueLabel(locationType: LocationType): string {
  return locationType === 'away' ? 'Away' : 'Home'
}

/** e.g. "vs. Beach FC (Home)" or "@ Beach FC (Away)" */
export function formatOpponentWithVenue(opponent: string, locationType: LocationType): string {
  const name = opponent.trim() || 'Opponent'
  const prefix = locationType === 'away' ? '@' : 'vs.'
  return `${prefix} ${name} (${formatVenueLabel(locationType)})`
}

export function formatOpponentPrefix(locationType: LocationType): string {
  return locationType === 'away' ? '@' : 'vs.'
}
