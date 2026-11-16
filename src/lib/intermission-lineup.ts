/** Next-period pitch saved on the match while coaches are in the break. */
export type IntermissionLineup = {
  updatedAt: number
  /** Period that just ended. A later break replaces this. */
  endedPeriod: number
  formationId: string
  starters: Record<string, boolean>
  slotAssignments: Record<string, string | null>
  slotLabelOverrides: Record<string, string>
}

const KEY = 'intermissionLineup'

export function intermissionLineupSignature(
  lineup: Omit<IntermissionLineup, 'updatedAt'>,
): string {
  return JSON.stringify({
    endedPeriod: lineup.endedPeriod,
    formationId: lineup.formationId,
    starters: stableRecord(lineup.starters),
    slotAssignments: stableRecord(lineup.slotAssignments),
    slotLabelOverrides: stableRecord(lineup.slotLabelOverrides),
  })
}

export function parseIntermissionLineup(raw: unknown): IntermissionLineup | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const record = raw as Record<string, unknown>
  const updatedAt = record.updatedAt
  const endedPeriod = record.endedPeriod
  const formationId = record.formationId
  if (typeof updatedAt !== 'number' || !Number.isFinite(updatedAt)) return null
  if (typeof endedPeriod !== 'number' || !Number.isInteger(endedPeriod) || endedPeriod < 1) {
    return null
  }
  if (typeof formationId !== 'string' || !formationId.trim()) return null
  return {
    updatedAt,
    endedPeriod,
    formationId: formationId.trim(),
    starters: booleanRecord(record.starters),
    slotAssignments: slotRecord(record.slotAssignments),
    slotLabelOverrides: stringRecord(record.slotLabelOverrides),
  }
}

export function readIntermissionLineup(context: unknown): IntermissionLineup | null {
  if (!context || typeof context !== 'object' || Array.isArray(context)) return null
  return parseIntermissionLineup((context as Record<string, unknown>)[KEY])
}

export function withIntermissionLineup(
  context: Record<string, unknown>,
  lineup: IntermissionLineup | null,
): Record<string, unknown> {
  if (!lineup) {
    const { [KEY]: _removed, ...rest } = context
    return rest
  }
  return { ...context, [KEY]: lineup }
}

function stableRecord(record: Record<string, unknown>): Array<[string, unknown]> {
  return Object.keys(record)
    .sort()
    .map((key) => [key, record[key]])
}

function booleanRecord(raw: unknown): Record<string, boolean> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const result: Record<string, boolean> = {}
  for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!id.trim() || typeof value !== 'boolean') continue
    result[id] = value
  }
  return result
}

function slotRecord(raw: unknown): Record<string, string | null> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const result: Record<string, string | null> = {}
  for (const [slotId, playerId] of Object.entries(raw as Record<string, unknown>)) {
    if (!slotId.trim()) continue
    result[slotId] = typeof playerId === 'string' && playerId.trim() ? playerId.trim() : null
  }
  return result
}

function stringRecord(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const result: Record<string, string> = {}
  for (const [slotId, label] of Object.entries(raw as Record<string, unknown>)) {
    if (!slotId.trim() || typeof label !== 'string' || !label.trim()) continue
    result[slotId] = label.trim()
  }
  return result
}
