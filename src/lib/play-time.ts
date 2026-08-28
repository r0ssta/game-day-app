import { normalizeTacticalMatchPosition } from '@/lib/positions'
import { getFormationById, resolveSlotLabel } from '@/lib/formations'
import type { MatchPlayer, RosterPlayer } from '@/types/match'

type CreateMatchPlayerInput = {
  attending: boolean
  isFirstHalfStarter: boolean
  isSecondHalfStarter: boolean
  isOnField: boolean
  matchPosition: string
}

export function createMatchPlayer(
  player: RosterPlayer,
  input: CreateMatchPlayerInput,
): MatchPlayer {
  return {
    ...player,
    impact: 'neutral',
    attending: input.attending,
    isFirstHalfStarter: input.isFirstHalfStarter,
    isSecondHalfStarter: input.isSecondHalfStarter,
    isOnField: input.isOnField,
    matchPosition: normalizeTacticalMatchPosition(input.matchPosition),
    totalSecondsPlayed: 0,
    subbedInAt: null,
    plusMinus: 0,
  }
}

/** Countdown clock: subbedInAt stores remaining seconds when the stint began. */
function stintSecondsPlayed(subbedInAt: number, remainingSeconds: number): number {
  return Math.max(0, subbedInAt - remainingSeconds)
}

/** Close an active on-field stint and add elapsed time to the total. */
export function finalizeStint(player: MatchPlayer, remainingSeconds: number): MatchPlayer {
  if (!player.isOnField || player.subbedInAt === null) {
    return { ...player, subbedInAt: null }
  }

  const stint = stintSecondsPlayed(player.subbedInAt, remainingSeconds)
  return {
    ...player,
    totalSecondsPlayed: player.totalSecondsPlayed + stint,
    subbedInAt: null,
  }
}

/** Halftime / fulltime — bank remaining time for everyone currently on the field. */
export function finalizeAllOnField(players: MatchPlayer[], remainingSeconds: number): MatchPlayer[] {
  return players.map((player) =>
    player.isOnField ? finalizeStint(player, remainingSeconds) : player,
  )
}

/** First clock start in a period — only stamp players not yet tracking a stint. */
export function stampOnFieldAtClock(
  players: MatchPlayer[],
  remainingSeconds: number,
): MatchPlayer[] {
  return players.map((player) =>
    player.isOnField && player.subbedInAt === null
      ? { ...player, subbedInAt: remainingSeconds }
      : player,
  )
}

/** Start-of-period kickoff — stamp every on-field player at the current clock. */
export function stampAllOnField(players: MatchPlayer[], remainingSeconds: number): MatchPlayer[] {
  return players.map((player) =>
    player.isOnField ? { ...player, subbedInAt: remainingSeconds } : player,
  )
}

/** Apply 2nd-half starter selections from halftime setup. */
export function applySecondHalfLineup(
  players: MatchPlayer[],
  secondHalfStarterIds: Set<string>,
): MatchPlayer[] {
  return players.map((player) => {
    if (!player.attending) {
      return { ...player, isOnField: false, subbedInAt: null }
    }
    const starts = secondHalfStarterIds.has(player.id)
    return {
      ...player,
      isSecondHalfStarter: starts,
      isOnField: starts,
      subbedInAt: null,
    }
  })
}

/** Map saved pitch slot assignments back onto player match positions. */
export function applySlotAssignmentPositions(
  players: MatchPlayer[],
  slotAssignments: Record<string, string | null>,
  formationId: string,
  slotLabelOverrides?: Record<string, string> | null,
): MatchPlayer[] {
  const formation = getFormationById(formationId)
  const slotById = new Map(formation.slots.map((slot) => [slot.id, slot]))
  const playerSlot = new Map<string, { slotId: string; slot: (typeof formation.slots)[number] }>()

  for (const [slotId, playerId] of Object.entries(slotAssignments)) {
    if (!playerId) continue
    const slot = slotById.get(slotId)
    if (slot) playerSlot.set(playerId, { slotId, slot })
  }

  return players.map((player) => {
    const entry = playerSlot.get(player.id)
    if (!entry) return player
    return {
      ...player,
      matchPosition: resolveSlotLabel(entry.slot, slotLabelOverrides),
    }
  })
}

export function applySubstitution(
  players: MatchPlayer[],
  benchId: string,
  fieldId: string,
  remainingSeconds: number,
): MatchPlayer[] {
  return players.map((player) => {
    if (player.id === fieldId) {
      const stint =
        player.isOnField && player.subbedInAt !== null
          ? stintSecondsPlayed(player.subbedInAt, remainingSeconds)
          : 0
      return {
        ...player,
        isOnField: false,
        totalSecondsPlayed: player.totalSecondsPlayed + stint,
        subbedInAt: null,
      }
    }
    if (player.id === benchId) {
      return {
        ...player,
        isOnField: true,
        subbedInAt: remainingSeconds,
      }
    }
    return player
  })
}

export function getLiveSecondsPlayed(player: MatchPlayer, remainingSeconds: number): number {
  const currentStint =
    player.isOnField && player.subbedInAt !== null
      ? stintSecondsPlayed(player.subbedInAt, remainingSeconds)
      : 0
  return player.totalSecondsPlayed + currentStint
}

export function formatPlayingTimeBadge(totalSeconds: number): string {
  return `${Math.floor(totalSeconds / 60)}m`
}

export function formatPlayingTimeClock(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60)
  const s = Math.floor(totalSeconds % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

export function applySubIn(
  players: MatchPlayer[],
  benchId: string,
  remainingSeconds: number,
): MatchPlayer[] {
  return players.map((player) =>
    player.id === benchId
      ? { ...player, isOnField: true, subbedInAt: remainingSeconds }
      : player,
  )
}

export function applySubOut(
  players: MatchPlayer[],
  fieldId: string,
  remainingSeconds: number,
): MatchPlayer[] {
  return players.map((player) => {
    if (player.id !== fieldId) return player
    const stint =
      player.isOnField && player.subbedInAt !== null
        ? stintSecondsPlayed(player.subbedInAt, remainingSeconds)
        : 0
    return {
      ...player,
      isOnField: false,
      totalSecondsPlayed: player.totalSecondsPlayed + stint,
      subbedInAt: null,
    }
  })
}
