export const LIVE_FIELD_POSITIONS = ['Forward', 'Midfielder', 'Defender', 'Keeper'] as const

export type LiveFieldPosition = (typeof LIVE_FIELD_POSITIONS)[number]

export function isLiveFieldPosition(value: string): value is LiveFieldPosition {
  return LIVE_FIELD_POSITIONS.includes(value as LiveFieldPosition)
}

export function liveFieldPositionLabel(value: string): string {
  return isLiveFieldPosition(value) ? value : 'Assign'
}

export function formationRoleToLivePosition(role: 'GK' | 'DEF' | 'MID' | 'FWD'): LiveFieldPosition {
  switch (role) {
    case 'GK':
      return 'Keeper'
    case 'DEF':
      return 'Defender'
    case 'MID':
      return 'Midfielder'
    case 'FWD':
      return 'Forward'
  }
}

/** Human-readable position for pitch badges (supports tactical codes and live labels). */
export function displayMatchPosition(value: string): string {
  if (isLiveFieldPosition(value)) return value

  const normalized = value.trim().toUpperCase()
  if (normalized === 'GK') return 'Keeper'
  if (['CB', 'LB', 'RB', 'DEF', 'LWB', 'RWB'].includes(normalized)) return 'Defender'
  if (['CM', 'CDM', 'CAM', 'LM', 'RM', 'MID'].includes(normalized)) return 'Midfielder'
  if (['CF', 'ST', 'LF', 'RF', 'FW', 'FWD'].includes(normalized)) return 'Forward'

  return value
}

export const MATCH_POSITIONS = ['GK', 'CB', 'LW', 'RW', 'CF', 'LF', 'RF', 'CM'] as const

export type MatchPosition = (typeof MATCH_POSITIONS)[number]

const LEGACY_POSITION_MAP: Record<string, MatchPosition> = {
  GK: 'GK',
  CB: 'CB',
  LB: 'CB',
  RB: 'CB',
  LW: 'LW',
  RW: 'RW',
  LM: 'LW',
  RM: 'RW',
  LF: 'LF',
  RF: 'RF',
  ST: 'CF',
  CF: 'CF',
  CM: 'CM',
  CDM: 'CM',
  CAM: 'CM',
  SUB: 'CM',
}

export function normalizeMatchPosition(position: string): MatchPosition {
  const key = position.trim().toUpperCase()
  if (MATCH_POSITIONS.includes(key as MatchPosition)) {
    return key as MatchPosition
  }
  return LEGACY_POSITION_MAP[key] ?? 'CM'
}

export function isMatchPosition(value: string): value is MatchPosition {
  return MATCH_POSITIONS.includes(value as MatchPosition)
}

export function ensureMatchPositions(
  players: { id: string; position: string }[],
  existing?: Record<string, string>,
): Record<string, string> {
  const positions: Record<string, string> = {}

  for (const player of players) {
    if (existing?.[player.id]) {
      positions[player.id] = normalizeMatchPosition(existing[player.id])
    } else {
      positions[player.id] = normalizeMatchPosition(player.position)
    }
  }

  return positions
}
