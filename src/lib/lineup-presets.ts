import { getFormationById, roleToTacticalPosition, type Formation } from '@/lib/formations'
import { ensureSetupLineup } from '@/lib/lineup'
import { ensureMatchPositions } from '@/lib/positions'
import type { DbLineupPreset } from '@/types/database'
import type { MatchPositionsConfig, RosterPlayer, SetupLineup } from '@/types/match'

export type LineupPresetFormationJson = {
  formationId: string
  slotAssignments: Record<string, string | null>
}

export function parseFormationJson(raw: unknown): LineupPresetFormationJson {
  if (!raw || typeof raw !== 'object') {
    return { formationId: '3-3-2', slotAssignments: {} }
  }
  const data = raw as Record<string, unknown>
  const formationId =
    typeof data.formationId === 'string' ? data.formationId : '3-3-2'
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
): {
  setupLineup: SetupLineup
  matchPositions: MatchPositionsConfig
  formationId: string
  slotAssignments: Record<string, string | null>
} {
  const parsed = parseFormationJson(preset.formation_json)
  const formation = getFormationById(parsed.formationId)
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
