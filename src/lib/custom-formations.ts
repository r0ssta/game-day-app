import {
  normalizeSlotLabel,
  type Formation,
  type FormationRole,
  type FormationSlot,
} from '@/lib/formations'
import { getMaxFieldPlayersForFormat, type TeamFormat } from '@/lib/team-format'

const ROLES = new Set<FormationRole>(['GK', 'DEF', 'MID', 'FWD'])

export const FORMATION_NAME_MAX = 40

export function normalizeFormationName(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ').slice(0, FORMATION_NAME_MAX)
}

function roundCoord(value: number): number {
  return Math.round(Math.min(100, Math.max(0, value)) * 10) / 10
}

export function formationSlotsForSave(
  slots: FormationSlot[],
  labelOverrides: Record<string, string> = {},
): FormationSlot[] {
  return slots.map((slot) => {
    const label = normalizeSlotLabel(labelOverrides[slot.id] ?? slot.label) || slot.label
    return {
      id: slot.id,
      role: slot.role,
      label,
      x: roundCoord(slot.x),
      y: roundCoord(slot.y),
    }
  })
}

export function parseFormationSlots(raw: unknown, format: TeamFormat): FormationSlot[] | null {
  if (!Array.isArray(raw)) return null
  const expected = getMaxFieldPlayersForFormat(format)
  if (raw.length !== expected) return null

  const slots: FormationSlot[] = []
  const ids = new Set<string>()
  let keepers = 0

  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') return null
    const row = entry as Record<string, unknown>
    const id = typeof row.id === 'string' ? row.id.trim() : ''
    const role = row.role
    const label = typeof row.label === 'string' ? normalizeSlotLabel(row.label) : ''
    const x = typeof row.x === 'number' ? row.x : Number.NaN
    const y = typeof row.y === 'number' ? row.y : Number.NaN
    if (!id || ids.has(id) || !ROLES.has(role as FormationRole)) return null
    if (!label || !Number.isFinite(x) || !Number.isFinite(y)) return null
    if (role === 'GK') keepers += 1
    ids.add(id)
    slots.push({
      id,
      role: role as FormationRole,
      label,
      x: roundCoord(x),
      y: roundCoord(y),
    })
  }

  if (keepers !== 1) return null
  return slots
}

export function formationFromRow(row: {
  id: string
  name: string
  format: string
  slots: unknown
}): Formation | null {
  if (row.format !== '7v7' && row.format !== '9v9' && row.format !== '11v11') return null
  const name = normalizeFormationName(row.name)
  const slots = parseFormationSlots(row.slots, row.format)
  if (!name || !slots) return null
  return { id: row.id, label: name, format: row.format, slots }
}
