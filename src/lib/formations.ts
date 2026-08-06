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
  slots: FormationSlot[]
}

export const FORMATIONS: Formation[] = [
  {
    id: '3-3-2',
    label: '3-3-2',
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
    id: '2-3-1',
    label: '2-3-1 (7v7)',
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

export function getFormationById(id: string): Formation {
  return FORMATIONS.find((f) => f.id === id) ?? FORMATIONS[0]
}

export const DEFAULT_FORMATION_ID = FORMATIONS[0].id

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
