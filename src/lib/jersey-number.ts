export const MIN_JERSEY_NUMBER = 0
export const MAX_JERSEY_NUMBER = 99
export const JERSEY_NUMBER_RANGE_MESSAGE = 'Jersey number must be a whole number from 0 to 99'
export const JERSEY_IN_USE_MESSAGE = 'That jersey number is already used on this team'

export const JERSEY_INPUT_PROPS = {
  type: 'number' as const,
  inputMode: 'numeric' as const,
  min: MIN_JERSEY_NUMBER,
  max: MAX_JERSEY_NUMBER,
  step: 1,
}

export type ParsedJerseyNumber =
  | { ok: true; value: number | null }
  | { ok: false; error: string }

/** Parse a jersey field. Empty is allowed (no number). Rejects negatives, decimals, and 100+. */
export function parseJerseyNumber(raw: string): ParsedJerseyNumber {
  const trimmed = raw.trim().replace(/^#/, '').trim()
  if (!trimmed) return { ok: true, value: null }
  if (!/^\d{1,2}$/.test(trimmed)) {
    return { ok: false, error: JERSEY_NUMBER_RANGE_MESSAGE }
  }
  const value = Number(trimmed)
  if (!Number.isInteger(value) || value < MIN_JERSEY_NUMBER || value > MAX_JERSEY_NUMBER) {
    return { ok: false, error: JERSEY_NUMBER_RANGE_MESSAGE }
  }
  return { ok: true, value }
}

export function parseJerseyNumberOrThrow(raw: string): number | null {
  const parsed = parseJerseyNumber(raw)
  if (!parsed.ok) throw new Error(parsed.error)
  return parsed.value
}

export function assertJerseyNumber(jersey: number | null | undefined): number | null {
  if (jersey == null) return null
  if (!Number.isInteger(jersey) || jersey < MIN_JERSEY_NUMBER || jersey > MAX_JERSEY_NUMBER) {
    throw new Error(JERSEY_NUMBER_RANGE_MESSAGE)
  }
  return jersey
}

export function rosterHasJersey(
  roster: Array<{ id: string; number: number | null }>,
  jersey: number | null,
  excludePlayerId?: string,
): boolean {
  if (jersey == null) return false
  return roster.some((player) => player.id !== excludePlayerId && player.number === jersey)
}
