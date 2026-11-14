import { isGoalkeeperPosition } from '@/lib/match-shot-save'
import { normalizeTacticalMatchPosition } from '@/lib/positions'
import { getFormationById, resolveSlotLabel } from '@/lib/formations'
import type { TeamFormat } from '@/lib/team-format'
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
    fieldSecondsPlayed: 0,
    gkSecondsPlayed: 0,
    subbedInAt: null,
    plusMinus: 0,
    yellowCardCount: 0,
    isSentOff: false,
  }
}

/** Countdown clock: subbedInAt stores remaining seconds when the stint began. */
function stintSecondsPlayed(subbedInAt: number, remainingSeconds: number): number {
  return Math.max(0, subbedInAt - remainingSeconds)
}

export type FinalizePlayTimeOptions = {
  /**
   * Remaining seconds at period kickoff. Used when an on-field player has no
   * `subbedInAt` stamp so we still bank time up to the whistle.
   */
  periodStartRemaining?: number
  /** Slot occupants — treat as on-field when `isOnField` has drifted. */
  onFieldIds?: Iterable<string>
}

function resolveOpenStintStart(
  player: MatchPlayer,
  periodStartRemaining?: number,
): number | null {
  if (player.subbedInAt !== null) return player.subbedInAt
  // Never-stamped starter who has not been subbed: assume they played from kickoff.
  // Only when nothing is banked — later periods already have P1+ totals, and
  // finalizing from kickoff again would double-count (React Strict Mode, intermission).
  if (player.isOnField && player.totalSecondsPlayed === 0 && periodStartRemaining != null) {
    return periodStartRemaining
  }
  return null
}

/** Live / intermission display: still count this period if the stamp was lost. */
function resolveDisplayStintStart(
  player: MatchPlayer,
  periodStartRemaining?: number,
): number | null {
  if (player.subbedInAt !== null) return player.subbedInAt
  if (player.isOnField && periodStartRemaining != null) return periodStartRemaining
  return null
}

export function allocateSecondsByRole(
  seconds: number,
  position: string | null | undefined,
): { fieldSecondsPlayed: number; gkSecondsPlayed: number } {
  const safe = Math.max(0, seconds)
  if (isGoalkeeperPosition(position)) {
    return { fieldSecondsPlayed: 0, gkSecondsPlayed: safe }
  }
  return { fieldSecondsPlayed: safe, gkSecondsPlayed: 0 }
}

function bankedRoleSeconds(player: MatchPlayer) {
  const field = player.fieldSecondsPlayed
  const gk = player.gkSecondsPlayed
  if (field != null || gk != null) {
    return {
      fieldSecondsPlayed: Math.max(0, field ?? 0),
      gkSecondsPlayed: Math.max(0, gk ?? 0),
    }
  }
  return allocateSecondsByRole(player.totalSecondsPlayed, player.matchPosition)
}

function withBankedStint(
  player: MatchPlayer,
  stint: number,
): Pick<MatchPlayer, 'totalSecondsPlayed' | 'fieldSecondsPlayed' | 'gkSecondsPlayed'> {
  const role = allocateSecondsByRole(stint, player.matchPosition)
  const banked = bankedRoleSeconds(player)
  return {
    totalSecondsPlayed: player.totalSecondsPlayed + stint,
    fieldSecondsPlayed: banked.fieldSecondsPlayed + role.fieldSecondsPlayed,
    gkSecondsPlayed: banked.gkSecondsPlayed + role.gkSecondsPlayed,
  }
}

/** Close an open stint and add elapsed time to the total. */
export function finalizeStint(
  player: MatchPlayer,
  remainingSeconds: number,
  periodStartRemaining?: number,
): MatchPlayer {
  const stintStart = resolveOpenStintStart(player, periodStartRemaining)
  if (stintStart === null) {
    return { ...player, subbedInAt: null }
  }

  const stint = stintSecondsPlayed(stintStart, remainingSeconds)
  return {
    ...player,
    ...withBankedStint(player, stint),
    subbedInAt: null,
  }
}

/** Halftime / fulltime — bank remaining time for everyone with an open stint. */
export function finalizeAllOnField(
  players: MatchPlayer[],
  remainingSeconds: number,
  options?: FinalizePlayTimeOptions,
): MatchPlayer[] {
  const extraIds = options?.onFieldIds ? new Set(options.onFieldIds) : null
  return players.map((player) => {
    const treatAsOnField = player.isOnField || (extraIds?.has(player.id) ?? false)
    if (!treatAsOnField && player.subbedInAt === null) return player
    return finalizeStint(
      treatAsOnField ? { ...player, isOnField: true } : player,
      remainingSeconds,
      options?.periodStartRemaining,
    )
  })
}

/**
 * Freeze the 1st-half starting XI from whoever is actually on the pitch at kickoff.
 * Setup-time flags can drift if the coach rearranges on the ready screen.
 */
export function freezeFirstHalfStarters(players: MatchPlayer[]): MatchPlayer[] {
  return players.map((player) => ({
    ...player,
    isFirstHalfStarter: Boolean(player.attending && player.isOnField),
  }))
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

/**
 * Apply 2nd-half starter selections from intermission setup.
 * Does not start a new stint — kickoff must `stampAllOnField` after this.
 * First-half totals are left untouched; pass `periodEndRemaining` to bank any
 * leftover open 1st-half stint at the whistle clock (never the next-period clock).
 */
export function applySecondHalfLineup(
  players: MatchPlayer[],
  secondHalfStarterIds: Set<string>,
  periodEndRemaining?: number,
  periodStartRemaining?: number,
): MatchPlayer[] {
  return players.map((player) => {
    const banked =
      periodEndRemaining !== undefined
        ? finalizeStint(player, periodEndRemaining, periodStartRemaining)
        : player
    if (!player.attending) {
      return { ...banked, isOnField: false, subbedInAt: null }
    }
    const starts = secondHalfStarterIds.has(player.id)
    return {
      ...banked,
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
  teamFormat?: TeamFormat,
): MatchPlayer[] {
  const formation = getFormationById(formationId, teamFormat)
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

/** Who is on the pitch at kickoff — slot occupants beat stale player flags. */
export function applyKickoffSlotLineup(
  players: MatchPlayer[],
  slotAssignments: Record<string, string | null>,
  formationId: string,
  slotLabelOverrides?: Record<string, string> | null,
  teamFormat?: TeamFormat,
): MatchPlayer[] {
  const onFieldIds = new Set(
    Object.values(slotAssignments).filter((id): id is string => Boolean(id)),
  )
  return applySlotAssignmentPositions(
    players,
    slotAssignments,
    formationId,
    slotLabelOverrides,
    teamFormat,
  ).map((player) =>
    player.attending ? { ...player, isOnField: onFieldIds.has(player.id) } : player,
  )
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
        ...withBankedStint(player, stint),
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

/**
 * Banked time plus any open stint, measured against a frozen remaining clock.
 * At intermission, pass the whistle remaining seconds — not a ticking clock —
 * so field players show 1st-half minutes and time does not run through the break.
 */
export function getSecondsPlayedAsOf(
  player: MatchPlayer,
  remainingSeconds: number,
  periodStartRemaining?: number,
): number {
  const stintStart = resolveDisplayStintStart(player, periodStartRemaining)
  if (stintStart === null) return player.totalSecondsPlayed
  return player.totalSecondsPlayed + stintSecondsPlayed(stintStart, remainingSeconds)
}

export function getRoleSecondsAsOf(
  player: MatchPlayer,
  remainingSeconds: number,
  periodStartRemaining?: number,
): { fieldSeconds: number; gkSeconds: number; totalSeconds: number } {
  const banked = bankedRoleSeconds(player)
  const stintStart = resolveDisplayStintStart(player, periodStartRemaining)
  const open = stintStart == null ? 0 : stintSecondsPlayed(stintStart, remainingSeconds)
  const openRole = allocateSecondsByRole(open, player.matchPosition)
  const fieldSeconds = banked.fieldSecondsPlayed + openRole.fieldSecondsPlayed
  const gkSeconds = banked.gkSecondsPlayed + openRole.gkSecondsPlayed
  return {
    fieldSeconds,
    gkSeconds,
    totalSeconds: fieldSeconds + gkSeconds,
  }
}

export function getLiveSecondsPlayed(
  player: MatchPlayer,
  remainingSeconds: number,
  periodStartRemaining?: number,
): number {
  return getSecondsPlayedAsOf(player, remainingSeconds, periodStartRemaining)
}

/** Seconds in the player's current uninterrupted on-field stint (0 if benched). */
export function getCurrentStintSeconds(player: MatchPlayer, remainingSeconds: number): number {
  if (!player.isOnField || player.subbedInAt === null) return 0
  return stintSecondsPlayed(player.subbedInAt, remainingSeconds)
}

/**
 * True when an on-field player has been out there for ≥75% of the half without a sub.
 * Helps coaches spot who is due for rotation.
 */
export function needsSubRotationCue(
  player: MatchPlayer,
  remainingSeconds: number,
  halfLengthSeconds: number,
  threshold = 0.75,
): boolean {
  if (!player.isOnField || halfLengthSeconds <= 0) return false
  const stint = getCurrentStintSeconds(player, remainingSeconds)
  return stint >= halfLengthSeconds * threshold
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
      ...withBankedStint(player, stint),
      subbedInAt: null,
    }
  })
}
