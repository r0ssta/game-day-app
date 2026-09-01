import {
  getFormationById,
  getDefaultFormationId,
  isFormationValidForFormat,
  reconcileSlotAssignments,
  resolveSlotLabel,
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
  /** Coach positional label renames keyed by formation slot id (e.g. LCB → LB). */
  slotLabelOverrides?: Record<string, string>
}

function parseSlotLabelOverrides(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== 'object') return {}
  const result: Record<string, string> = {}
  for (const [slotId, label] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof label !== 'string') continue
    const trimmed = label.trim().toUpperCase()
    if (trimmed) result[slotId] = trimmed
  }
  return result
}

export function parseFormationJson(raw: unknown, teamFormat?: TeamFormat): LineupPresetFormationJson {
  const fallbackFormationId = teamFormat ? getDefaultFormationId(teamFormat) : '3-3-2'
  if (!raw || typeof raw !== 'object') {
    return { formationId: fallbackFormationId, slotAssignments: {}, slotLabelOverrides: {} }
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
  return {
    formationId,
    slotAssignments,
    slotLabelOverrides: parseSlotLabelOverrides(data.slotLabelOverrides),
  }
}

export function buildFormationJson(
  formationId: string,
  slotAssignments: Record<string, string | null>,
  slotLabelOverrides?: Record<string, string> | null,
): LineupPresetFormationJson {
  const overrides = parseSlotLabelOverrides(slotLabelOverrides ?? {})
  return {
    formationId,
    slotAssignments,
    ...(Object.keys(overrides).length > 0 ? { slotLabelOverrides: overrides } : {}),
  }
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
  const eligible = new Set(
    Object.values(slotAssignments).filter(
      (playerId): playerId is string => Boolean(playerId) && rosterIds.has(playerId),
    ),
  )
  return reconcileSlotAssignments(
    formation,
    slotAssignments,
    [...eligible].map((id) => ({ id })),
    eligible,
  )
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
  slotLabelOverrides: Record<string, string>
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
      matchPositions[playerId] = resolveSlotLabel(slot, parsed.slotLabelOverrides)
    }
  }

  return {
    setupLineup,
    matchPositions,
    formationId: parsed.formationId,
    slotAssignments,
    slotLabelOverrides: parsed.slotLabelOverrides ?? {},
  }
}

export function applyPresetToHalftime(
  preset: DbLineupPreset,
  attendingPlayers: Array<{ id: string }>,
  teamFormat: TeamFormat,
): {
  formationId: string
  slotAssignments: Record<string, string | null>
  slotLabelOverrides: Record<string, string>
  starters: Record<string, boolean>
  matchPositions: Record<string, string>
} {
  const parsed = parseFormationJson(preset.formation_json, teamFormat)
  validatePresetFormation(parsed.formationId, teamFormat)

  const formation = getFormationById(parsed.formationId, teamFormat)
  const rosterIds = new Set(attendingPlayers.map((player) => player.id))
  const slotAssignments = sanitizeSlotAssignments(parsed.slotAssignments, rosterIds, formation)

  const starters: Record<string, boolean> = {}
  for (const player of attendingPlayers) {
    starters[player.id] = false
  }
  for (const playerId of Object.values(slotAssignments)) {
    if (playerId) starters[playerId] = true
  }

  const matchPositions: Record<string, string> = {}
  for (const slot of formation.slots) {
    const playerId = slotAssignments[slot.id]
    if (playerId) {
      matchPositions[playerId] = resolveSlotLabel(slot, parsed.slotLabelOverrides)
    }
  }

  return {
    formationId: parsed.formationId,
    slotAssignments,
    slotLabelOverrides: parsed.slotLabelOverrides ?? {},
    starters,
    matchPositions,
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
