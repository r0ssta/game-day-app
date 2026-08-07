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
      { id: 'def-l', role: 'DEF', label: 'DEF', x: 35, y: 76 },
      { id: 'def-r', role: 'DEF', label: 'DEF', x: 65, y: 76 },
      { id: 'mid-l', role: 'MID', label: 'MID', x: 28, y: 52 },
      { id: 'mid-c', role: 'MID', label: 'MID', x: 50, y: 50 },
      { id: 'mid-r', role: 'MID', label: 'MID', x: 72, y: 52 },
      { id: 'fwd', role: 'FWD', label: 'FWD', x: 50, y: 26 },
    ],
  },
  {
    id: '3-2-1',
    label: '3-2-1',
    format: '7v7',
    slots: [
      { id: 'gk', role: 'GK', label: 'GK', x: 50, y: 90 },
      { id: 'def-l', role: 'DEF', label: 'DEF', x: 28, y: 76 },
      { id: 'def-c', role: 'DEF', label: 'DEF', x: 50, y: 78 },
      { id: 'def-r', role: 'DEF', label: 'DEF', x: 72, y: 76 },
      { id: 'mid-l', role: 'MID', label: 'MID', x: 38, y: 52 },
      { id: 'mid-r', role: 'MID', label: 'MID', x: 62, y: 52 },
      { id: 'fwd', role: 'FWD', label: 'FWD', x: 50, y: 26 },
    ],
  },
  {
    id: '3-3-2',
    label: '3-3-2',
    format: '9v9',
    slots: [
      { id: 'gk', role: 'GK', label: 'GK', x: 50, y: 90 },
      { id: 'def-l', role: 'DEF', label: 'DEF', x: 22, y: 74 },
      { id: 'def-c', role: 'DEF', label: 'DEF', x: 50, y: 76 },
      { id: 'def-r', role: 'DEF', label: 'DEF', x: 78, y: 74 },
      { id: 'mid-l', role: 'MID', label: 'MID', x: 26, y: 52 },
      { id: 'mid-c', role: 'MID', label: 'MID', x: 50, y: 50 },
      { id: 'mid-r', role: 'MID', label: 'MID', x: 74, y: 52 },
      { id: 'fwd-l', role: 'FWD', label: 'FWD', x: 38, y: 26 },
      { id: 'fwd-r', role: 'FWD', label: 'FWD', x: 62, y: 26 },
    ],
  },
  {
    id: '3-2-3',
    label: '3-2-3',
    format: '9v9',
    slots: [
      { id: 'gk', role: 'GK', label: 'GK', x: 50, y: 90 },
      { id: 'def-l', role: 'DEF', label: 'DEF', x: 24, y: 74 },
      { id: 'def-c', role: 'DEF', label: 'DEF', x: 50, y: 76 },
      { id: 'def-r', role: 'DEF', label: 'DEF', x: 76, y: 74 },
      { id: 'mid-l', role: 'MID', label: 'MID', x: 38, y: 52 },
      { id: 'mid-r', role: 'MID', label: 'MID', x: 62, y: 52 },
      { id: 'fwd-l', role: 'FWD', label: 'FWD', x: 22, y: 28 },
      { id: 'fwd-c', role: 'FWD', label: 'FWD', x: 50, y: 24 },
      { id: 'fwd-r', role: 'FWD', label: 'FWD', x: 78, y: 28 },
    ],
  },
  {
    id: '4-3-1',
    label: '4-3-1',
    format: '9v9',
    slots: [
      { id: 'gk', role: 'GK', label: 'GK', x: 50, y: 90 },
      { id: 'def-lb', role: 'DEF', label: 'DEF', x: 15, y: 74 },
      { id: 'def-l', role: 'DEF', label: 'DEF', x: 35, y: 76 },
      { id: 'def-r', role: 'DEF', label: 'DEF', x: 65, y: 76 },
      { id: 'def-rb', role: 'DEF', label: 'DEF', x: 85, y: 74 },
      { id: 'mid-l', role: 'MID', label: 'MID', x: 30, y: 50 },
      { id: 'mid-c', role: 'MID', label: 'MID', x: 50, y: 52 },
      { id: 'mid-r', role: 'MID', label: 'MID', x: 70, y: 50 },
      { id: 'fwd', role: 'FWD', label: 'FWD', x: 50, y: 24 },
    ],
  },
  {
    id: '2-3-2-1',
    label: '2-3-2-1',
    format: '9v9',
    slots: [
      { id: 'gk', role: 'GK', label: 'GK', x: 50, y: 90 },
      { id: 'def-l', role: 'DEF', label: 'DEF', x: 35, y: 76 },
      { id: 'def-r', role: 'DEF', label: 'DEF', x: 65, y: 76 },
      { id: 'mid-l', role: 'MID', label: 'MID', x: 22, y: 58 },
      { id: 'mid-c', role: 'MID', label: 'MID', x: 50, y: 54 },
      { id: 'mid-r', role: 'MID', label: 'MID', x: 78, y: 58 },
      { id: 'am-l', role: 'MID', label: 'MID', x: 38, y: 38 },
      { id: 'am-r', role: 'MID', label: 'MID', x: 62, y: 38 },
      { id: 'fwd', role: 'FWD', label: 'FWD', x: 50, y: 22 },
    ],
  },
  {
    id: '4-4-2',
    label: '4-4-2',
    format: '11v11',
    slots: [
      { id: 'gk', role: 'GK', label: 'GK', x: 50, y: 92 },
      { id: 'def-lb', role: 'DEF', label: 'LB', x: 14, y: 78 },
      { id: 'def-lcb', role: 'DEF', label: 'CB', x: 36, y: 80 },
      { id: 'def-rcb', role: 'DEF', label: 'CB', x: 64, y: 80 },
      { id: 'def-rb', role: 'DEF', label: 'RB', x: 86, y: 78 },
      { id: 'mid-lm', role: 'MID', label: 'LM', x: 18, y: 54 },
      { id: 'mid-lcm', role: 'MID', label: 'CM', x: 38, y: 56 },
      { id: 'mid-rcm', role: 'MID', label: 'CM', x: 62, y: 56 },
      { id: 'mid-rm', role: 'MID', label: 'RM', x: 82, y: 54 },
      { id: 'fwd-ls', role: 'FWD', label: 'ST', x: 38, y: 24 },
      { id: 'fwd-rs', role: 'FWD', label: 'ST', x: 62, y: 24 },
    ],
  },
  {
    id: '4-3-3',
    label: '4-3-3',
    format: '11v11',
    slots: [
      { id: 'gk', role: 'GK', label: 'GK', x: 50, y: 92 },
      { id: 'def-lb', role: 'DEF', label: 'LB', x: 14, y: 78 },
      { id: 'def-lcb', role: 'DEF', label: 'CB', x: 36, y: 80 },
      { id: 'def-rcb', role: 'DEF', label: 'CB', x: 64, y: 80 },
      { id: 'def-rb', role: 'DEF', label: 'RB', x: 86, y: 78 },
      { id: 'mid-lcm', role: 'MID', label: 'CM', x: 32, y: 54 },
      { id: 'mid-cdm', role: 'MID', label: 'CDM', x: 50, y: 58 },
      { id: 'mid-rcm', role: 'MID', label: 'CM', x: 68, y: 54 },
      { id: 'fwd-lw', role: 'FWD', label: 'LW', x: 22, y: 26 },
      { id: 'fwd-st', role: 'FWD', label: 'ST', x: 50, y: 22 },
      { id: 'fwd-rw', role: 'FWD', label: 'RW', x: 78, y: 26 },
    ],
  },
  {
    id: '3-5-2',
    label: '3-5-2',
    format: '11v11',
    slots: [
      { id: 'gk', role: 'GK', label: 'GK', x: 50, y: 92 },
      { id: 'def-lcb', role: 'DEF', label: 'CB', x: 30, y: 80 },
      { id: 'def-cb', role: 'DEF', label: 'CB', x: 50, y: 82 },
      { id: 'def-rcb', role: 'DEF', label: 'CB', x: 70, y: 80 },
      { id: 'mid-lwb', role: 'MID', label: 'LWB', x: 12, y: 58 },
      { id: 'mid-lcm', role: 'MID', label: 'CM', x: 35, y: 54 },
      { id: 'mid-cdm', role: 'MID', label: 'CDM', x: 50, y: 58 },
      { id: 'mid-rcm', role: 'MID', label: 'CM', x: 65, y: 54 },
      { id: 'mid-rwb', role: 'MID', label: 'RWB', x: 88, y: 58 },
      { id: 'fwd-ls', role: 'FWD', label: 'ST', x: 40, y: 24 },
      { id: 'fwd-rs', role: 'FWD', label: 'ST', x: 60, y: 24 },
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

/** Tactical code for a formation slot (CB, CF, ST, etc.). */
export function slotToTacticalPosition(slot: FormationSlot): string {
  const label = slot.label.trim().toUpperCase()
  if (label && !GENERIC_SLOT_LABELS.has(label)) {
    return label
  }
  return roleToTacticalPosition(slot.role)
}

/** Derive per-player tactical positions from saved pitch slot assignments. */
export function matchPositionsFromSlotAssignments(
  slotAssignments: Record<string, string | null>,
  formationId: string,
  format?: TeamFormat,
): Record<string, string> {
  const formation = getFormationById(formationId, format)
  const slotById = new Map(formation.slots.map((slot) => [slot.id, slot]))
  const positions: Record<string, string> = {}

  for (const [slotId, playerId] of Object.entries(slotAssignments)) {
    if (!playerId) continue
    const slot = slotById.get(slotId)
    if (slot) positions[playerId] = slotToTacticalPosition(slot)
  }

  return positions
}

export function getFormationsForFormat(format: TeamFormat): Formation[] {
  return FORMATIONS.filter((formation) => formation.format === format)
}

export function getDefaultFormationId(format: TeamFormat = DEFAULT_TEAM_FORMAT): string {
  return getFormationsForFormat(format)[0]?.id ?? '3-3-2'
}

export function isFormationValidForFormat(formationId: string, format: TeamFormat): boolean {
  const formation = FORMATIONS.find((entry) => entry.id === formationId)
  return formation?.format === format
}

export function getFormationById(id: string, format?: TeamFormat): Formation {
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

  for (const slot of formation.slots) {
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
  positionUpdates: Array<{ playerId: string; position: string }>
  overflowPlayerIds: string[]
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
  },
): FormationRemapResult {
  const mapSlot =
    options?.mapSlotToPosition ??
    ((slot: FormationSlot) => (options?.mapRoleToPosition ?? roleToTacticalPosition)(slot.role))
  const nextAssignments: Record<string, string | null> = Object.fromEntries(
    nextFormation.slots.map((slot) => [slot.id, null]),
  )
  const playerById = new Map(players.map((player) => [player.id, player]))

  const pool = [
    ...new Set(
      Object.values(currentAssignments).filter((playerId): playerId is string => Boolean(playerId)),
    ),
  ].filter((playerId) => !options?.eligiblePlayerIds || options.eligiblePlayerIds.has(playerId))

  const used = new Set<string>()
  const positionUpdates: Array<{ playerId: string; position: string }> = []

  const assign = (slot: FormationSlot, playerId: string) => {
    nextAssignments[slot.id] = playerId
    used.add(playerId)
    positionUpdates.push({
      playerId,
      position: mapSlot(slot),
    })
  }

  for (const slot of nextFormation.slots) {
    let bestId: string | null = null
    let bestScore = 0
    for (const playerId of pool) {
      if (used.has(playerId)) continue
      const player = playerById.get(playerId)
      if (!player) continue
      const score = scorePlayerForSlot(player, slot)
      if (score > bestScore) {
        bestScore = score
        bestId = playerId
      }
    }
    if (bestId && bestScore >= 4) assign(slot, bestId)
  }

  for (const slot of nextFormation.slots) {
    if (nextAssignments[slot.id]) continue
    const fallback = pool.find((playerId) => !used.has(playerId))
    if (fallback) assign(slot, fallback)
  }

  const overflowPlayerIds = pool.filter((playerId) => !used.has(playerId))

  return {
    slotAssignments: nextAssignments,
    positionUpdates,
    overflowPlayerIds,
  }
}
