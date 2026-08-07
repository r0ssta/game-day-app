import { getMaxFieldPlayersForFormat, type TeamFormat } from '@/lib/team-format'
import type { SetupLineup } from '@/types/match'

/** @deprecated Use getMaxFieldPlayersForFormat(teamFormat) instead */
export const MAX_FIELD_PLAYERS = 9

export function getMaxFieldPlayers(format: TeamFormat): number {
  return getMaxFieldPlayersForFormat(format)
}

export function createDefaultSetupLineup(playerIds: string[]): SetupLineup {
  return {
    attending: Object.fromEntries(playerIds.map((id) => [id, true])),
    startFirstHalf: Object.fromEntries(playerIds.map((id) => [id, false])),
  }
}

export function ensureSetupLineup(playerIds: string[], existing?: SetupLineup): SetupLineup {
  const base = createDefaultSetupLineup(playerIds)
  if (!existing) return base

  for (const id of playerIds) {
    if (id in existing.attending) base.attending[id] = existing.attending[id]
    if (id in existing.startFirstHalf) base.startFirstHalf[id] = existing.startFirstHalf[id]
  }
  return base
}

export function getAttendingIds(setup: SetupLineup): string[] {
  return Object.entries(setup.attending)
    .filter(([, attending]) => attending !== false)
    .map(([id]) => id)
}

export function ensureHalftimeStarters(
  attendingIds: string[],
  existing: Record<string, boolean>,
): Record<string, boolean> {
  return Object.fromEntries(attendingIds.map((id) => [id, existing[id] ?? false]))
}

export function getFirstHalfStarterIds(setup: SetupLineup): string[] {
  return Object.entries(setup.startFirstHalf)
    .filter(([id, starts]) => setup.attending[id] !== false && starts)
    .map(([id]) => id)
}

export function countFirstHalfStarters(setup: SetupLineup): number {
  return getFirstHalfStarterIds(setup).length
}

export function countSecondHalfStarters(secondHalfStarters: Record<string, boolean>): number {
  return Object.values(secondHalfStarters).filter(Boolean).length
}

export function isSetupLineupValid(setup: SetupLineup, maxFieldPlayers: number): boolean {
  const attending = getAttendingIds(setup).length
  if (attending === 0) return false
  return countFirstHalfStarters(setup) <= maxFieldPlayers
}

export function isHalftimeLineupValid(
  secondHalfStarters: Record<string, boolean>,
  maxFieldPlayers: number,
): boolean {
  return countSecondHalfStarters(secondHalfStarters) <= maxFieldPlayers
}
