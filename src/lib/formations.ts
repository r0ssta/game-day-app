import type { TeamFormat } from '@/lib/team-format'
import { DEFAULT_TEAM_FORMAT } from '@/lib/team-format'

export type FormationRole = 'GK' | 'DEF' | 'MID' | 'FWD'

export type FormationSlot = {
  id: string
  role: FormationRole
  label: string
  /** Horizontal position on pitch (0 = left touchline, 100 = right). */
  x: number
  /** Vertical position (0 = attacking end, 100 = own goal line). */
  y: number
}

export type Formation = {
  id: string
  label: string
  format: TeamFormat
  slots: FormationSlot[]
}

export const FORMATIONS: Formation[] = [
  {
    id: '2-3-1',
    label: '2-3-1',
    format: '7v7',
    slots: [
      { id: 'gk', role: 'GK', label: 'GK', x: 50, y: 90 },
      { id: 'def-l', role: 'DEF', label: 'LB', x: 35, y: 76 },
      { id: 'def-r', role: 'DEF', label: 'RB', x: 65, y: 76 },
      { id: 'mid-l', role: 'MID', label: 'LM', x: 28, y: 52 },
      { id: 'mid-c', role: 'MID', label: 'CM', x: 50, y: 50 },
      { id: 'mid-r', role: 'MID', label: 'RM', x: 72, y: 52 },
      { id: 'fwd', role: 'FWD', label: 'ST', x: 50, y: 26 },
    ],
  },
  {
    id: '3-2-1',
    label: '3-2-1',
    format: '7v7',
    slots: [
      { id: 'gk', role: 'GK', label: 'GK', x: 50, y: 90 },
      { id: 'def-l', role: 'DEF', label: 'LCB', x: 28, y: 76 },
      { id: 'def-c', role: 'DEF', label: 'CB', x: 50, y: 78 },
      { id: 'def-r', role: 'DEF', label: 'RCB', x: 72, y: 76 },
      { id: 'mid-l', role: 'MID', label: 'CM', x: 38, y: 52 },
      { id: 'mid-r', role: 'MID', label: 'CM', x: 62, y: 52 },
      { id: 'fwd', role: 'FWD', label: 'ST', x: 50, y: 26 },
    ],
  },
  {
    id: '3-3-2',
    label: '3-3-2',
    format: '9v9',
    slots: [
      { id: 'gk', role: 'GK', label: 'GK', x: 50, y: 90 },
      { id: 'def-l', role: 'DEF', label: 'LCB', x: 22, y: 74 },
      { id: 'def-c', role: 'DEF', label: 'CB', x: 50, y: 76 },
      { id: 'def-r', role: 'DEF', label: 'RCB', x: 78, y: 74 },
      { id: 'mid-l', role: 'MID', label: 'LM', x: 26, y: 52 },
      { id: 'mid-c', role: 'MID', label: 'CM', x: 50, y: 50 },
      { id: 'mid-r', role: 'MID', label: 'RM', x: 74, y: 52 },
      { id: 'fwd-l', role: 'FWD', label: 'LF', x: 38, y: 26 },
      { id: 'fwd-r', role: 'FWD', label: 'RF', x: 62, y: 26 },
    ],
  },
  {
    id: '3-2-3',
    label: '3-2-3',
    format: '9v9',
    slots: [
      { id: 'gk', role: 'GK', label: 'GK', x: 50, y: 90 },
      { id: 'def-l', role: 'DEF', label: 'LCB', x: 24, y: 74 },
      { id: 'def-c', role: 'DEF', label: 'CB', x: 50, y: 76 },
      { id: 'def-r', role: 'DEF', label: 'RCB', x: 76, y: 74 },
      { id: 'mid-l', role: 'MID', label: 'CDM', x: 38, y: 52 },
      { id: 'mid-r', role: 'MID', label: 'CAM', x: 62, y: 52 },
      { id: 'fwd-l', role: 'FWD', label: 'LW', x: 22, y: 28 },
      { id: 'fwd-c', role: 'FWD', label: 'ST', x: 50, y: 24 },
      { id: 'fwd-r', role: 'FWD', label: 'RW', x: 78, y: 28 },
    ],
  },
  {
    id: '4-3-1',
    label: '4-3-1',
    format: '9v9',
    slots: [
      { id: 'gk', role: 'GK', label: 'GK', x: 50, y: 90 },
      { id: 'def-lb', role: 'DEF', label: 'LB', x: 15, y: 74 },
      { id: 'def-l', role: 'DEF', label: 'LCB', x: 35, y: 76 },
      { id: 'def-r', role: 'DEF', label: 'RCB', x: 65, y: 76 },
      { id: 'def-rb', role: 'DEF', label: 'RB', x: 85, y: 74 },
      { id: 'mid-l', role: 'MID', label: 'CM', x: 30, y: 50 },
      { id: 'mid-c', role: 'MID', label: 'CDM', x: 50, y: 52 },
      { id: 'mid-r', role: 'MID', label: 'CM', x: 70, y: 50 },
      { id: 'fwd', role: 'FWD', label: 'ST', x: 50, y: 24 },
    ],
  },
  {
    id: '2-3-2-1',
    label: '2-3-2-1',
    format: '9v9',
    slots: [
      { id: 'gk', role: 'GK', label: 'GK', x: 50, y: 90 },
      { id: 'def-l', role: 'DEF', label: 'LB', x: 35, y: 76 },
      { id: 'def-r', role: 'DEF', label: 'RB', x: 65, y: 76 },
      { id: 'mid-l', role: 'MID', label: 'LM', x: 22, y: 58 },
      { id: 'mid-c', role: 'MID', label: 'CDM', x: 50, y: 54 },
      { id: 'mid-r', role: 'MID', label: 'RM', x: 78, y: 58 },
      { id: 'am-l', role: 'MID', label: 'CAM', x: 38, y: 38 },
      { id: 'am-r', role: 'MID', label: 'CAM', x: 62, y: 38 },
      { id: 'fwd', role: 'FWD', label: 'ST', x: 50, y: 22 },
    ],
  },
  {
    id: '4-4-2',
    label: '4-4-2',
    format: '11v11',
    slots: [
      // Keep GK clear of pitch overflow + sticky match footer hit-testing.
      { id: 'gk', role: 'GK', label: 'GK', x: 50, y: 84 },
      { id: 'def-lb', role: 'DEF', label: 'LB', x: 14, y: 70 },
      { id: 'def-lcb', role: 'DEF', label: 'LCB', x: 36, y: 72 },
      { id: 'def-rcb', role: 'DEF', label: 'RCB', x: 64, y: 72 },
      { id: 'def-rb', role: 'DEF', label: 'RB', x: 86, y: 70 },
      { id: 'mid-lm', role: 'MID', label: 'LM', x: 18, y: 50 },
      { id: 'mid-lcm', role: 'MID', label: 'CM', x: 38, y: 52 },
      { id: 'mid-rcm', role: 'MID', label: 'CM', x: 62, y: 52 },
      { id: 'mid-rm', role: 'MID', label: 'RM', x: 82, y: 50 },
      { id: 'fwd-ls', role: 'FWD', label: 'ST', x: 38, y: 22 },
      { id: 'fwd-rs', role: 'FWD', label: 'ST', x: 62, y: 22 },
    ],
  },
  {
    id: '4-3-3',
    label: '4-3-3',
    format: '11v11',
    slots: [
      { id: 'gk', role: 'GK', label: 'GK', x: 50, y: 84 },
      { id: 'def-lb', role: 'DEF', label: 'LB', x: 14, y: 70 },
      { id: 'def-lcb', role: 'DEF', label: 'LCB', x: 36, y: 72 },
      { id: 'def-rcb', role: 'DEF', label: 'RCB', x: 64, y: 72 },
      { id: 'def-rb', role: 'DEF', label: 'RB', x: 86, y: 70 },
      { id: 'mid-lcm', role: 'MID', label: 'CM', x: 32, y: 50 },
      { id: 'mid-cdm', role: 'MID', label: 'CDM', x: 50, y: 54 },
      { id: 'mid-rcm', role: 'MID', label: 'CM', x: 68, y: 50 },
      { id: 'fwd-lw', role: 'FWD', label: 'LW', x: 22, y: 24 },
      { id: 'fwd-st', role: 'FWD', label: 'ST', x: 50, y: 20 },
      { id: 'fwd-rw', role: 'FWD', label: 'RW', x: 78, y: 24 },
    ],
  },
  {
    id: '4-5-1',
    label: '4-5-1',
    format: '11v11',
    slots: [
      { id: 'gk', role: 'GK', label: 'GK', x: 50, y: 84 },
      { id: 'def-lb', role: 'DEF', label: 'LB', x: 14, y: 70 },
      { id: 'def-lcb', role: 'DEF', label: 'LCB', x: 36, y: 72 },
      { id: 'def-rcb', role: 'DEF', label: 'RCB', x: 64, y: 72 },
      { id: 'def-rb', role: 'DEF', label: 'RB', x: 86, y: 70 },
      { id: 'mid-lm', role: 'MID', label: 'LM', x: 16, y: 48 },
      { id: 'mid-lcm', role: 'MID', label: 'CM', x: 32, y: 50 },
      { id: 'mid-cdm', role: 'MID', label: 'CDM', x: 50, y: 54 },
      { id: 'mid-rcm', role: 'MID', label: 'CM', x: 68, y: 50 },
      { id: 'mid-rm', role: 'MID', label: 'RM', x: 84, y: 48 },
      { id: 'fwd-st', role: 'FWD', label: 'ST', x: 50, y: 20 },
    ],
  },
  {
    id: '3-5-2',
    label: '3-5-2',
    format: '11v11',
    slots: [
      { id: 'gk', role: 'GK', label: 'GK', x: 50, y: 84 },
      { id: 'def-lcb', role: 'DEF', label: 'LCB', x: 30, y: 72 },
      { id: 'def-cb', role: 'DEF', label: 'CB', x: 50, y: 74 },
      { id: 'def-rcb', role: 'DEF', label: 'RCB', x: 70, y: 72 },
      { id: 'mid-lwb', role: 'MID', label: 'LWB', x: 12, y: 54 },
      { id: 'mid-lcm', role: 'MID', label: 'CM', x: 35, y: 50 },
      { id: 'mid-cdm', role: 'MID', label: 'CDM', x: 50, y: 54 },
      { id: 'mid-rcm', role: 'MID', label: 'CM', x: 65, y: 50 },
      { id: 'mid-rwb', role: 'MID', label: 'RWB', x: 88, y: 54 },
      { id: 'fwd-ls', role: 'FWD', label: 'ST', x: 40, y: 22 },
      { id: 'fwd-rs', role: 'FWD', label: 'ST', x: 60, y: 22 },
    ],
  },
]

export function roleToTacticalPosition(role: FormationRole): string {
  switch (role) {
    case 'GK':
      return 'GK'
    case 'DEF':
      return 'CB'
    case 'MID':
      return 'CM'
    case 'FWD':
      return 'CF'
  }
}

const GENERIC_SLOT_LABELS = new Set(['DEF', 'MID', 'FWD', 'GK'])

function tacticalPositionFromGenericSlot(slot: FormationSlot): string {
  const id = slot.id.toLowerCase()

  if (slot.role === 'GK') return 'GK'

  if (slot.role === 'DEF') {
    if (id.includes('lwb')) return 'LWB'
    if (id.includes('rwb')) return 'RWB'
    if (id.includes('lb') || id.endsWith('-l') || id.includes('-l-')) return 'LB'
    if (id.includes('rb') || id.endsWith('-r') || id.includes('-r-')) return 'RB'
    return 'CB'
  }

  if (slot.role === 'MID') {
    if (id.includes('cdm') || id.includes('-dm')) return 'CDM'
    if (id.startsWith('am-')) {
      if (id.endsWith('-l')) return 'LM'
      if (id.endsWith('-r')) return 'RM'
      return 'CAM'
    }
    if (id.includes('cam')) return 'CAM'
    if (id.includes('lwb')) return 'LWB'
    if (id.includes('rwb')) return 'RWB'
    if (id.includes('lm') || id.endsWith('-l') || id.includes('-l-')) return 'LM'
    if (id.includes('rm') || id.endsWith('-r') || id.includes('-r-')) return 'RM'
    return 'CM'
  }

  if (slot.role === 'FWD') {
    if (id.includes('lw')) return 'LW'
    if (id.includes('rw')) return 'RW'
    if (id.includes('st')) return 'ST'
    if (id.includes('lf') || id.endsWith('-l') || id.includes('-l-')) return 'LF'
    if (id.includes('rf') || id.endsWith('-r') || id.includes('-r-')) return 'RF'
    return 'CF'
  }

  return roleToTacticalPosition(slot.role)
}

/** Tactical codes coaches can assign to formation slots. */
export const TACTICAL_SLOT_LABELS = [
  'GK',
  'LB',
  'LCB',
  'CB',
  'RCB',
  'RB',
  'LWB',
  'RWB',
  'CDM',
  'CM',
  'CAM',
  'LM',
  'RM',
  'LW',
  'RW',
  'LF',
  'RF',
  'ST',
  'CF',
] as const

export type TacticalSlotLabel = (typeof TACTICAL_SLOT_LABELS)[number]

/** Tactical code for a formation slot (CB, CF, ST, etc.). */
export function slotToTacticalPosition(slot: FormationSlot): string {
  const label = slot.label.trim().toUpperCase()
  if (label && !GENERIC_SLOT_LABELS.has(label)) {
    return label
  }
  return tacticalPositionFromGenericSlot(slot)
}

/** Keep tactical codes uppercase. Custom names such as Winger keep the coach's text. */
export function normalizeSlotLabel(raw: string): string {
  const trimmed = raw.trim().replace(/\s+/g, ' ').slice(0, 18)
  if (!trimmed) return ''
  const upper = trimmed.toUpperCase()
  if ((TACTICAL_SLOT_LABELS as readonly string[]).includes(upper)) return upper
  return trimmed
}

export function resolveSlotLabel(
  slot: FormationSlot,
  overrides?: Record<string, string> | null,
): string {
  const override = normalizeSlotLabel(overrides?.[slot.id] ?? '')
  if (override) return override
  const label = slot.label.trim()
  const normalized = normalizeSlotLabel(label)
  if (normalized && !GENERIC_SLOT_LABELS.has(normalized.toUpperCase())) return normalized
  return slotToTacticalPosition(slot)
}

/** Slot with optional coach override applied for display/tracking. */
export function slotWithResolvedLabel(
  slot: FormationSlot,
  overrides?: Record<string, string> | null,
): FormationSlot {
  return { ...slot, label: resolveSlotLabel(slot, overrides) }
}

/** Derive per-player tactical positions from saved pitch slot assignments. */
export function matchPositionsFromSlotAssignments(
  slotAssignments: Record<string, string | null>,
  formationId: string,
  format?: TeamFormat,
  slotLabelOverrides?: Record<string, string> | null,
): Record<string, string> {
  const formation = getFormationById(formationId, format)
  const slotById = new Map(formation.slots.map((slot) => [slot.id, slot]))
  const positions: Record<string, string> = {}

  for (const [slotId, playerId] of Object.entries(slotAssignments)) {
    if (!playerId) continue
    const slot = slotById.get(slotId)
    if (slot) {
      positions[playerId] = resolveSlotLabel(slot, slotLabelOverrides)
    }
  }

  return positions
}

/** Rebuild pitch slots from saved starter positions (best-effort label match). */
export function slotAssignmentsFromMatchPositions(
  formationId: string,
  starters: Array<{ playerId: string; position: string }>,
  format?: TeamFormat,
): Record<string, string | null> {
  const formation = getFormationById(formationId, format)
  const assignments: Record<string, string | null> = {}
  for (const slot of formation.slots) assignments[slot.id] = null

  const usedSlots = new Set<string>()
  const placed = new Set<string>()

  for (const starter of starters) {
    const pos = starter.position.trim().toUpperCase()
    if (!pos) continue
    const slot = formation.slots.find(
      (entry) =>
        !usedSlots.has(entry.id) &&
        (entry.label.toUpperCase() === pos || entry.id.toUpperCase() === pos),
    )
    if (!slot) continue
    assignments[slot.id] = starter.playerId
    usedSlots.add(slot.id)
    placed.add(starter.playerId)
  }

  for (const starter of starters) {
    if (placed.has(starter.playerId)) continue
    const empty = formation.slots.find((entry) => !assignments[entry.id])
    if (!empty) continue
    assignments[empty.id] = starter.playerId
    placed.add(starter.playerId)
  }

  return assignments
}

let activeCustomFormations: Formation[] = []
let customFormationsReady = false

/** Loaded saved shapes for the active team. Formation lookup uses this list. */
export function setActiveCustomFormations(formations: Formation[], ready: boolean): void {
  activeCustomFormations = formations
  customFormationsReady = ready
}

export function getActiveCustomFormations(format?: TeamFormat): Formation[] {
  if (!format) return activeCustomFormations
  return activeCustomFormations.filter((formation) => formation.format === format)
}

function lookupCustomFormation(
  id: string,
  format?: TeamFormat,
  extra: Formation[] = [],
): Formation | undefined {
  return [...extra, ...activeCustomFormations].find(
    (formation) => formation.id === id && (!format || formation.format === format),
  )
}

export function isCustomFormationId(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
}

export function getFormationsForFormat(format: TeamFormat): Formation[] {
  return FORMATIONS.filter((formation) => formation.format === format)
}

export function getDefaultFormationId(format: TeamFormat = DEFAULT_TEAM_FORMAT): string {
  return getFormationsForFormat(format)[0]?.id ?? '3-3-2'
}

export function isFormationValidForFormat(formationId: string, format: TeamFormat): boolean {
  if (lookupCustomFormation(formationId, format)) return true
  const formation = FORMATIONS.find((entry) => entry.id === formationId)
  return formation?.format === format
}

/** Drop a 9v9/11v11 shape onto a 7v7 team (and the reverse) so the pitch slot count matches the format. */
export function resolveFormationIdForFormat(
  formationId: string | null | undefined,
  format: TeamFormat,
): string {
  if (formationId && isFormationValidForFormat(formationId, format)) return formationId
  if (formationId && !customFormationsReady && isCustomFormationId(formationId)) return formationId
  return getDefaultFormationId(format)
}

export function getFormationById(
  id: string,
  format?: TeamFormat,
  extra: Formation[] = [],
): Formation {
  const custom = lookupCustomFormation(id, format, extra)
  if (custom) return custom
  const found = FORMATIONS.find((formation) => formation.id === id)
  if (found && (!format || found.format === format)) return found
  if (format) return getFormationsForFormat(format)[0] ?? FORMATIONS[0]
  return found ?? FORMATIONS.find((formation) => formation.format === DEFAULT_TEAM_FORMAT) ?? FORMATIONS[0]
}

export const DEFAULT_FORMATION_ID = getDefaultFormationId(DEFAULT_TEAM_FORMAT)

export function getFormationLabel(id: string): string {
  return getFormationById(id).label
}

export function buildAssignmentsFromStarters(
  formation: Formation,
  players: { id: string; matchPosition?: string; position?: string }[],
  starters: Record<string, boolean>,
): Record<string, string | null> {
  const assignments: Record<string, string | null> = Object.fromEntries(
    formation.slots.map((s) => [s.id, null]),
  )

  const starterIds = players.filter((p) => starters[p.id]).map((p) => p.id)
  const used = new Set<string>()

  // Lock exact label / slot-id matches first so a coach's ST stays ST, not LW.
  for (const id of starterIds) {
    const player = players.find((p) => p.id === id)
    const pos = (player?.matchPosition ?? player?.position ?? '').trim().toUpperCase()
    if (!pos) continue
    const slot = formation.slots.find(
      (entry) =>
        assignments[entry.id] == null &&
        (entry.label.toUpperCase() === pos || entry.id.toUpperCase() === pos),
    )
    if (!slot) continue
    assignments[slot.id] = id
    used.add(id)
  }

  // Role / leftover fill only runs on empty slots — never overwrite a lock.
  for (const slot of formation.slots) {
    if (assignments[slot.id]) continue
    const preferred = starterIds.find((id) => {
      if (used.has(id)) return false
      const player = players.find((p) => p.id === id)
      const pos = (player?.matchPosition ?? player?.position ?? '').toUpperCase()
      if (slot.role === 'GK') return pos.includes('GK')
      if (slot.role === 'DEF') return pos.includes('CB') || pos.includes('DEF') || pos.includes('LB') || pos.includes('RB')
      if (slot.role === 'FWD') return pos.includes('CF') || pos.includes('ST') || pos.includes('FW') || pos.includes('FWD')
      return pos.includes('CM') || pos.includes('MID')
    })

    const fallback = starterIds.find((id) => !used.has(id))
    const pick = preferred ?? fallback
    if (pick) {
      assignments[slot.id] = pick
      used.add(pick)
    }
  }

  return assignments
}

function normalizePositionToken(value: string): string {
  return value.toUpperCase()
}

function playerMatchesFormationRole(position: string, role: FormationRole): boolean {
  const pos = normalizePositionToken(position)
  if (role === 'GK') return pos.includes('GK') || pos.includes('KEEPER')
  if (role === 'DEF') {
    return /CB|DEF|LB|RB|BACK|SW|DEFENDER/.test(pos)
  }
  if (role === 'FWD') {
    return /CF|ST|FW|FWD|WING|LW|RW|STRIKER|FORWARD/.test(pos)
  }
  return /CM|MID|CDM|CAM|AM|WM|DM|MIDFIELDER/.test(pos)
}

function scorePlayerForSlot(
  player: { matchPosition?: string; position?: string },
  slot: FormationSlot,
): number {
  const pos = normalizePositionToken(player.matchPosition ?? player.position ?? '')
  if (!pos) return 0
  if (playerMatchesFormationRole(pos, slot.role)) return 10
  if (slot.role === 'MID' && /DEF|FWD/.test(pos)) return 4
  if (slot.role === 'DEF' && /MID/.test(pos)) return 3
  if (slot.role === 'FWD' && /MID/.test(pos)) return 3
  return 1
}

export type FormationRemapResult = {
  slotAssignments: Record<string, string | null>
  positionUpdates: Array<{ playerId: string; position: string; previousPosition?: string }>
  overflowPlayerIds: string[]
}

type SlotFamily = 'GK' | 'FB' | 'CB' | 'CM' | 'WM' | 'W' | 'ST'

/**
 * The job a spot actually is, which is finer than DEF/MID/FWD.
 * A wingback and a fullback are the same kind of player; a center back is not a left back.
 */
function slotFamily(slot: FormationSlot): SlotFamily {
  const label = slot.label.trim().toUpperCase()
  if (slot.role === 'GK' || label === 'GK') return 'GK'
  if (label === 'LB' || label === 'RB' || label === 'LWB' || label === 'RWB') return 'FB'
  if (label === 'LCB' || label === 'RCB' || label === 'CB' || label === 'SW') return 'CB'
  if (label === 'CDM' || label === 'CM' || label === 'CAM') return 'CM'
  if (label === 'LM' || label === 'RM') return 'WM'
  if (label === 'LW' || label === 'RW') return 'W'
  if (label === 'ST' || label === 'CF' || label === 'LF' || label === 'RF') return 'ST'

  if (slot.role === 'DEF') return slot.x <= 22 || slot.x >= 78 ? 'FB' : 'CB'
  if (slot.role === 'FWD') return slot.x <= 32 || slot.x >= 68 ? 'W' : 'ST'
  return slot.x <= 26 || slot.x >= 74 ? 'WM' : 'CM'
}

/**
 * How unnatural it is for that player to take this new job.
 * Close changes (wingback ↔ fullback, winger ↔ wide mid, spare center back into
 * the pivot) stay cheap. A center back becoming a striker does not.
 */
function familyPenalty(from: SlotFamily, to: SlotFamily): number {
  if (from === to) return 0
  if (from === 'GK' || to === 'GK') return 5_000

  const penalty: Partial<Record<SlotFamily, Partial<Record<SlotFamily, number>>>> = {
    FB: { CB: 14, WM: 26, W: 28 },
    CB: { FB: 18, CM: 4 },
    CM: { CB: 12, WM: 6, ST: 22, W: 24 },
    WM: { FB: 10, CM: 8, W: 6, ST: 14 },
    W: { WM: 6, ST: 8, CM: 20 },
    ST: { W: 8, WM: 12, CM: 18 },
  }
  return penalty[from]?.[to] ?? 78
}

/**
 * Cost of moving someone from the spot they are standing to a slot in the new shape.
 * Same job and same side are cheap, so a left wingback drops to left back when a
 * back four appears, and a center back does not end up on the opposite wing.
 */
function slotTransitionCost(from: FormationSlot, to: FormationSlot): number {
  const fromFamily = slotFamily(from)
  const toFamily = slotFamily(to)
  if (fromFamily === 'GK' || toFamily === 'GK') {
    return fromFamily === toFamily ? 0 : 5_000
  }

  const dx = from.x - to.x
  const dy = (from.y - to.y) * 1.15
  const distance = Math.hypot(dx, dy)
  const crosses = (from.x <= 42 && to.x >= 58) || (from.x >= 58 && to.x <= 42)

  return distance + familyPenalty(fromFamily, toFamily) + (crosses ? 64 : 0)
}

function roleFromPosition(position: string): FormationRole | null {
  const pos = normalizePositionToken(position)
  if (!pos) return null
  if (playerMatchesFormationRole(pos, 'GK')) return 'GK'
  if (playerMatchesFormationRole(pos, 'DEF')) return 'DEF'
  if (playerMatchesFormationRole(pos, 'FWD')) return 'FWD'
  if (playerMatchesFormationRole(pos, 'MID')) return 'MID'
  return null
}

/** Rough spot from a tactical code, used when we don't know where they were standing. */
function slotFromPosition(position: string): FormationSlot | null {
  const label = normalizePositionToken(position).replace(/[^A-Z]/g, '')
  if (!label) return null

  const known: Record<string, { role: FormationRole; x: number; y: number }> = {
    GK: { role: 'GK', x: 50, y: 86 },
    LB: { role: 'DEF', x: 16, y: 72 },
    LCB: { role: 'DEF', x: 34, y: 74 },
    CB: { role: 'DEF', x: 50, y: 74 },
    RCB: { role: 'DEF', x: 66, y: 74 },
    RB: { role: 'DEF', x: 84, y: 72 },
    LWB: { role: 'MID', x: 14, y: 56 },
    RWB: { role: 'MID', x: 86, y: 56 },
    LM: { role: 'MID', x: 18, y: 50 },
    RM: { role: 'MID', x: 82, y: 50 },
    CDM: { role: 'MID', x: 50, y: 56 },
    CM: { role: 'MID', x: 50, y: 50 },
    CAM: { role: 'MID', x: 50, y: 40 },
    LW: { role: 'FWD', x: 22, y: 26 },
    RW: { role: 'FWD', x: 78, y: 26 },
    LF: { role: 'FWD', x: 38, y: 24 },
    RF: { role: 'FWD', x: 62, y: 24 },
    ST: { role: 'FWD', x: 50, y: 22 },
    CF: { role: 'FWD', x: 50, y: 22 },
  }
  const listed = known[label]
  if (listed) return { id: 'listed', label, ...listed }

  const role = roleFromPosition(label)
  if (!role) return null
  let x = 50
  if (/^(L|LEFT)/.test(label)) x = 28
  else if (/^(R|RIGHT)/.test(label)) x = 72
  const y = role === 'GK' ? 86 : role === 'DEF' ? 72 : role === 'FWD' ? 24 : 52
  return { id: 'listed', role, label, x, y }
}

function bitCount(mask: number): number {
  let count = 0
  let bits = mask
  while (bits) {
    count += bits & 1
    bits >>>= 1
  }
  return count
}

/**
 * Assign players to unique slots at minimum total cost. Extras stay unmatched
 * when there are more players than slots — the players who fit worst sit out,
 * not whoever happens to be last in the list. Formation size is at most 11.
 */
function assignMinCost(costs: number[][]): number[] {
  const playerCount = costs.length
  const slotOfPlayer = Array<number>(playerCount).fill(-1)
  if (playerCount === 0) return slotOfPlayer

  const realSlots = costs[0]?.length ?? 0
  if (realSlots === 0) return slotOfPlayer

  // Dummy seats absorb overflow at no cost, so the search keeps the matching
  // of real slots that moves everyone else the least.
  const dummyCount = Math.max(0, playerCount - realSlots)
  const slotCount = realSlots + dummyCount
  const limit = 1 << slotCount
  const bestCost = new Float64Array(limit).fill(Number.POSITIVE_INFINITY)
  const choice = new Int16Array(limit).fill(-1)
  bestCost[0] = 0

  const costAt = (player: number, slot: number) => (slot < realSlots ? costs[player][slot] : 0)

  for (let mask = 0; mask < limit; mask++) {
    const placed = bitCount(mask)
    if (placed >= playerCount || !Number.isFinite(bestCost[mask])) continue
    for (let slot = 0; slot < slotCount; slot++) {
      const bit = 1 << slot
      if (mask & bit) continue
      const next = mask | bit
      const cost = bestCost[mask] + costAt(placed, slot)
      if (cost < bestCost[next]) {
        bestCost[next] = cost
        choice[next] = slot
      }
    }
  }

  const placedCount = Math.min(playerCount, slotCount)
  let bestMask = 0
  let winner = Number.POSITIVE_INFINITY
  for (let mask = 0; mask < limit; mask++) {
    if (bitCount(mask) !== placedCount) continue
    if (bestCost[mask] < winner) {
      winner = bestCost[mask]
      bestMask = mask
    }
  }

  let mask = bestMask
  for (let index = bitCount(mask) - 1; index >= 0; index--) {
    const slot = choice[mask]
    if (slot < 0) break
    // Dummy seats mean this player does not fit the new shape.
    slotOfPlayer[index] = slot < realSlots ? slot : -1
    mask &= ~(1 << slot)
  }
  return slotOfPlayer
}

/** Re-map on-field (or assigned) players onto a new formation shape. */
export function remapFormationSlotAssignments(
  currentAssignments: Record<string, string | null>,
  nextFormation: Formation,
  players: { id: string; matchPosition?: string; position?: string }[],
  options?: {
    eligiblePlayerIds?: Set<string>
    mapRoleToPosition?: (role: FormationRole) => string
    mapSlotToPosition?: (slot: FormationSlot) => string
    /** Shape they are leaving. Spots are matched from these coordinates. */
    fromFormation?: Formation
  },
): FormationRemapResult {
  const mapSlot =
    options?.mapSlotToPosition ??
    ((slot: FormationSlot) => (options?.mapRoleToPosition ?? roleToTacticalPosition)(slot.role))
  const nextAssignments: Record<string, string | null> = Object.fromEntries(
    nextFormation.slots.map((slot) => [slot.id, null]),
  )
  const playerById = new Map(players.map((player) => [player.id, player]))
  const fromSlotById = new Map((options?.fromFormation?.slots ?? []).map((slot) => [slot.id, slot]))

  const pool = [
    ...new Set(
      Object.values(currentAssignments).filter((playerId): playerId is string => Boolean(playerId)),
    ),
  ].filter((playerId) => !options?.eligiblePlayerIds || options.eligiblePlayerIds.has(playerId))

  const fromSlotByPlayer = new Map<string, FormationSlot>()
  for (const [slotId, playerId] of Object.entries(currentAssignments)) {
    if (!playerId || fromSlotByPlayer.has(playerId)) continue
    const standing = fromSlotById.get(slotId)
    if (standing) fromSlotByPlayer.set(playerId, standing)
  }

  const candidates = pool
    .map((playerId) => {
      const player = playerById.get(playerId)
      const listed = (player?.matchPosition ?? player?.position ?? '').trim()
      const standing = fromSlotByPlayer.get(playerId) ?? slotFromPosition(listed)
      return { playerId, standing, listed, x: standing?.x ?? 50 }
    })
    .sort((a, b) => a.x - b.x || a.playerId.localeCompare(b.playerId))

  const slots = nextFormation.slots
  const costs = candidates.map((candidate) =>
    slots.map((slot) => (candidate.standing ? slotTransitionCost(candidate.standing, slot) : 40)),
  )
  const slotOfPlayer = assignMinCost(costs)

  const positionUpdates: Array<{ playerId: string; position: string; previousPosition?: string }> =
    []
  const used = new Set<string>()

  candidates.forEach((candidate, index) => {
    const slotIndex = slotOfPlayer[index]
    const slot = slotIndex >= 0 ? slots[slotIndex] : undefined
    if (!slot || nextAssignments[slot.id]) return
    nextAssignments[slot.id] = candidate.playerId
    used.add(candidate.playerId)
    positionUpdates.push({
      playerId: candidate.playerId,
      position: mapSlot(slot),
      ...(candidate.listed ? { previousPosition: candidate.listed } : {}),
    })
  })

  const overflowPlayerIds = pool.filter((playerId) => !used.has(playerId))

  return {
    slotAssignments: nextAssignments,
    positionUpdates,
    overflowPlayerIds,
  }
}

/**
 * Keep players already sitting on valid slots, then pour leftover keys (e.g. 9v9
 * `fwd-l` / `fwd-r`) and unplaced eligible players into empty slots.
 * Does not reshuffle occupied slots — safe to run on live sync.
 */
export function reconcileSlotAssignments(
  formation: Formation,
  currentAssignments: Record<string, string | null>,
  players: { id: string; matchPosition?: string; position?: string }[],
  eligiblePlayerIds: Set<string>,
): Record<string, string | null> {
  const next: Record<string, string | null> = Object.fromEntries(
    formation.slots.map((slot) => [slot.id, null]),
  )
  const used = new Set<string>()
  const slotIdSet = new Set(formation.slots.map((slot) => slot.id))
  const playerById = new Map(players.map((player) => [player.id, player]))

  for (const slot of formation.slots) {
    const playerId = currentAssignments[slot.id]
    if (playerId && eligiblePlayerIds.has(playerId) && !used.has(playerId)) {
      next[slot.id] = playerId
      used.add(playerId)
    }
  }

  const leftoverIds: string[] = []
  for (const [slotId, playerId] of Object.entries(currentAssignments)) {
    if (!playerId || used.has(playerId) || !eligiblePlayerIds.has(playerId)) continue
    if (!slotIdSet.has(slotId)) leftoverIds.push(playerId)
  }
  const missing = [...eligiblePlayerIds].filter((playerId) => !used.has(playerId))
  const pool = [...new Set([...leftoverIds, ...missing])]

  for (const slot of formation.slots) {
    if (next[slot.id]) continue
    let pick: string | null = null
    let bestScore = 0
    for (const playerId of pool) {
      if (used.has(playerId)) continue
      const player = playerById.get(playerId)
      if (!player) {
        if (!pick) pick = playerId
        continue
      }
      const score = scorePlayerForSlot(player, slot)
      if (score > bestScore) {
        bestScore = score
        pick = playerId
      }
    }
    if (!pick) pick = pool.find((playerId) => !used.has(playerId)) ?? null
    if (pick) {
      next[slot.id] = pick
      used.add(pick)
    }
  }

  return next
}
