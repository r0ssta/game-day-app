import {
  getFormationById,
  getDefaultFormationId,
  isFormationValidForFormat,
  roleToTacticalPosition,
  type Formation,
} from '@/lib/formations'
import { ensureSetupLineup } from '@/lib/lineup'
import { ensureMatchPositions } from '@/lib/positions'
import type { TeamFormat } from '@/lib/team-format'
import type { DbLineupPreset } from '@/types/database'
import type { MatchPositionsConfig, RosterPlayer, SetupLineup } from '@/types/match'

export type LineupPresetFormationJson = {
  formationId: string
  slotAssignments: Record<string, string | null>
}

export function parseFormationJson(raw: unknown, teamFormat?: TeamFormat): LineupPresetFormationJson {
  const fallbackFormationId = teamFormat ? getDefaultFormationId(teamFormat) : '3-3-2'
  if (!raw || typeof raw !== 'object') {
    return { formationId: fallbackFormationId, slotAssignments: {} }
  }
  const data = raw as Record<string, unknown>
  const formationId =
    typeof data.formationId === 'string' ? data.formationId : fallbackFormationId
  const slotAssignments: Record<string, string | null> = {}
  if (data.slotAssignments && typeof data.slotAssignments === 'object') {
    for (const [slotId, playerId] of Object.entries(
      data.slotAssignments as Record<string, unknown>,
    )) {
      slotAssignments[slotId] = typeof playerId === 'string' ? playerId : null
    }
  }
  return { formationId, slotAssignments }
}

export function buildFormationJson(
  formationId: string,
  slotAssignments: Record<string, string | null>,
): LineupPresetFormationJson {
  return { formationId, slotAssignments }
}

export function validatePresetFormation(formationId: string, teamFormat: TeamFormat): void {
  if (!isFormationValidForFormat(formationId, teamFormat)) {
    throw new Error(
      `This lineup uses a formation that doesn't match the team's ${teamFormat} format.`,
    )
  }
}

export function sanitizeSlotAssignments(
  slotAssignments: Record<string, string | null>,
  rosterIds: Set<string>,
  formation: Formation,
): Record<string, string | null> {
  const validSlotIds = new Set(formation.slots.map((s) => s.id))
  const used = new Set<string>()
  const result: Record<string, string | null> = Object.fromEntries(
    formation.slots.map((s) => [s.id, null]),
  )

  for (const slot of formation.slots) {
    const playerId = slotAssignments[slot.id]
    if (
      playerId &&
      rosterIds.has(playerId) &&
      !used.has(playerId) &&
      validSlotIds.has(slot.id)
    ) {
      result[slot.id] = playerId
      used.add(playerId)
    }
  }

  return result
}

export function applyPresetToSetup(
  preset: DbLineupPreset,
  roster: RosterPlayer[],
  teamFormat: TeamFormat,
): {
  setupLineup: SetupLineup
  matchPositions: MatchPositionsConfig
  formationId: string
  slotAssignments: Record<string, string | null>
} {
  const parsed = parseFormationJson(preset.formation_json, teamFormat)
  validatePresetFormation(parsed.formationId, teamFormat)

  const formation = getFormationById(parsed.formationId, teamFormat)
  const rosterIds = new Set(roster.map((p) => p.id))
  const slotAssignments = sanitizeSlotAssignments(parsed.slotAssignments, rosterIds, formation)

  const playerIds = roster.map((p) => p.id)
  const setupLineup = ensureSetupLineup(playerIds)
  for (const id of playerIds) {
    setupLineup.startFirstHalf[id] = false
  }
  for (const playerId of Object.values(slotAssignments)) {
    if (playerId) setupLineup.startFirstHalf[playerId] = true
  }

  const matchPositions = ensureMatchPositions(roster)
  for (const slot of formation.slots) {
    const playerId = slotAssignments[slot.id]
    if (playerId) {
      matchPositions[playerId] = roleToTacticalPosition(slot.role)
    }
  }

  return {
    setupLineup,
    matchPositions,
    formationId: parsed.formationId,
    slotAssignments,
  }
}

export function startersFromSlotAssignments(
  slotAssignments: Record<string, string | null>,
): Record<string, boolean> {
  const starters: Record<string, boolean> = {}
  for (const playerId of Object.values(slotAssignments)) {
    if (playerId) starters[playerId] = true
  }
  return starters
}

export function starterIdsFromSlotAssignments(
  slotAssignments: Record<string, string | null>,
): string[] {
  return Object.values(slotAssignments).filter((id): id is string => Boolean(id))
}

/** Prefer live pitch slot assignments over persisted startFirstHalf flags. */
export function resolveSetupLineup(
  setup: SetupLineup,
  slotAssignments?: Record<string, string | null> | null,
): SetupLineup {
  if (!slotAssignments) return setup

  const starterIds = new Set(starterIdsFromSlotAssignments(slotAssignments))
  const playerIds = new Set([
    ...Object.keys(setup.attending),
    ...Object.keys(setup.startFirstHalf),
  ])

  const startFirstHalf = Object.fromEntries(
    [...playerIds].map((id) => [id, starterIds.has(id)]),
  )

  return { ...setup, startFirstHalf }
}
