import type { AbsenceReason, MatchPlayer } from '@/types/match'

export type AvailabilityChange =
  | { attending: true }
  | { attending: false; reason: AbsenceReason | null }

export function absenceReasonLabel(reason: AbsenceReason | null | undefined): string | null {
  if (reason === 'injured') return 'Injured'
  if (reason === 'left_early') return 'Left early'
  return null
}

export function parseAbsenceReason(value: unknown): AbsenceReason | null {
  return value === 'injured' || value === 'left_early' ? value : null
}

/**
 * Players who were in the match, including anyone who played and then left.
 * Pre-game absences stay out of recaps and season totals.
 */
export function includeInMatchRecord(player: {
  attending: boolean
  totalSecondsPlayed?: number
}): boolean {
  return player.attending || (player.totalSecondsPlayed ?? 0) > 0
}

/**
 * Bring an out player onto the bench, or take a benched player out of the match.
 * On-field players have to be subbed off first so an open stint is banked.
 */
export function applyAvailabilityChange(
  players: MatchPlayer[],
  playerId: string,
  change: AvailabilityChange,
): MatchPlayer[] | null {
  const current = players.find((player) => player.id === playerId)
  if (!current || current.isSentOff) return null
  if (change.attending) {
    if (current.attending) return null
  } else if (!current.attending || current.isOnField) {
    return null
  }

  return players.map((player) => {
    if (player.id !== playerId) return player
    if (change.attending) {
      return {
        ...player,
        attending: true,
        isOnField: false,
        subbedInAt: null,
        absenceReason: null,
      }
    }
    return {
      ...player,
      attending: false,
      isOnField: false,
      subbedInAt: null,
      absenceReason: change.reason,
    }
  })
}
