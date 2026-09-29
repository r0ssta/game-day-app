import { parseShotType, SHOT_TYPES, type ShotType } from '@/schemas/match-actions'

export type ShotTypeCounts = Partial<Record<ShotType, number>>

export type ShotTypeScoreline = {
  type: ShotType
  us: number
  them: number
}

export type PlayerShotLine = {
  playerId: string
  name: string
  shots: number
  detail: string
}

type ShotEvent = {
  eventType: string
  eventNotes: string | null
  playerId?: string | null
  playerName?: string | null
}

export function addShotType(counts: ShotTypeCounts, notes: string | null | undefined) {
  const type = parseShotType(notes)
  if (!type) return
  counts[type] = (counts[type] ?? 0) + 1
}

export function mergeShotTypeCounts(into: ShotTypeCounts, from: ShotTypeCounts) {
  for (const type of SHOT_TYPES) {
    const count = from[type] ?? 0
    if (count > 0) into[type] = (into[type] ?? 0) + count
  }
}

/** Known types only, in the coach tagging order. Untagged shots stay in the shot total. */
export function formatShotTypeCounts(counts: ShotTypeCounts): string {
  return SHOT_TYPES.filter((type) => (counts[type] ?? 0) > 0)
    .map((type) => `${counts[type]} ${type}`)
    .join(' · ')
}

export function formatPlayerShots(shots: number, counts: ShotTypeCounts): string {
  if (shots <= 0) return ''
  const detail = formatShotTypeCounts(counts)
  return detail ? `Shots ${shots} · ${detail}` : `Shots ${shots}`
}

/** Compact score for a player row: "1 PK", or "2 · 1 PK" when some shots were untagged. */
export function formatPlayerShotScore(shots: number, detail: string): string {
  if (!detail) return String(shots)
  const tagged = detail.split(' · ').reduce((sum, part) => {
    const count = Number(part.split(' ')[0])
    return sum + (Number.isFinite(count) ? count : 0)
  }, 0)
  return tagged === shots ? detail : `${shots} · ${detail}`
}

/**
 * Team shot types and our shooters.
 * Counts `shot_home` / `shot_away` only. An opponent save also writes `shot_home`,
 * so the paired save row is not added again.
 */
export function summarizeMatchShots(events: ShotEvent[]): {
  shotTypes: ShotTypeScoreline[]
  playerShots: PlayerShotLine[]
} {
  const us = new Map<ShotType, number>()
  const them = new Map<ShotType, number>()
  const players = new Map<string, { name: string; shots: number; byType: ShotTypeCounts }>()

  for (const event of events) {
    const type = parseShotType(event.eventNotes)
    if (event.eventType === 'shot_home') {
      if (type) us.set(type, (us.get(type) ?? 0) + 1)
      const playerId = event.playerId?.trim()
      if (playerId) {
        const row = players.get(playerId) ?? {
          name: event.playerName?.trim() || 'Player',
          shots: 0,
          byType: {},
        }
        if (event.playerName?.trim()) row.name = event.playerName.trim()
        row.shots += 1
        if (type) row.byType[type] = (row.byType[type] ?? 0) + 1
        players.set(playerId, row)
      }
    } else if (event.eventType === 'shot_away' && type) {
      them.set(type, (them.get(type) ?? 0) + 1)
    }
  }

  const shotTypes = SHOT_TYPES.flatMap((type) => {
    const home = us.get(type) ?? 0
    const away = them.get(type) ?? 0
    return home + away > 0 ? [{ type, us: home, them: away }] : []
  })

  const playerShots = [...players.entries()]
    .map(([playerId, row]) => ({
      playerId,
      name: row.name,
      shots: row.shots,
      detail: formatShotTypeCounts(row.byType),
    }))
    .sort((a, b) => b.shots - a.shots || a.name.localeCompare(b.name))

  return { shotTypes, playerShots }
}
