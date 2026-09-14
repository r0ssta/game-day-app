import { parseOpponentGoalCategory } from '@/schemas/match-actions'

/** Markers stored in match_events.event_notes for Parent Hub formatting. */

export const STARTING_LINEUP_NOTE_PREFIX = 'starting_lineup|'
export const PERIOD_END_NOTE = 'period_end'

export function startingLineupNote(position: string | null | undefined): string {
  const pos = (position ?? '').trim()
  return pos ? `${STARTING_LINEUP_NOTE_PREFIX}${pos}` : STARTING_LINEUP_NOTE_PREFIX.slice(0, -1)
}

export function parseStartingLineupPosition(notes: string | null | undefined): string | null {
  const raw = (notes ?? '').trim()
  if (!raw) return null
  if (raw.startsWith(STARTING_LINEUP_NOTE_PREFIX)) {
    const pos = raw.slice(STARTING_LINEUP_NOTE_PREFIX.length).trim()
    return pos || null
  }
  // Legacy kickoff rows stored the bare pitch position in event_notes.
  if (/^[A-Z0-9][A-Z0-9/+-]{0,7}$/i.test(raw)) return raw
  return null
}

export function isTaggedStartingLineupNote(notes: string | null | undefined): boolean {
  const raw = (notes ?? '').trim()
  return raw.startsWith(STARTING_LINEUP_NOTE_PREFIX) || raw === 'starting_lineup'
}

/**
 * Clock rewind that starts the next period — kickoff remaining, not a mid-period
 * length/remaining edit. Those drops used to inject a full period of padding
 * into recap minutes.
 */
export function isPeriodStartBoundary(input: {
  eventType: string
  eventNotes?: string | null
  timestamp: number
  previousTimestamp: number
}): boolean {
  if (input.eventType !== 'sub_in') return false
  if (isTaggedStartingLineupNote(input.eventNotes) && input.previousTimestamp > 30) {
    return true
  }
  return input.timestamp <= 0 && input.timestamp < input.previousTimestamp - 30
}

export function isStartingLineupEvent(
  eventType: string,
  notes: string | null | undefined,
  timestamp: number,
): boolean {
  if (eventType !== 'sub_in') return false
  if (isTaggedStartingLineupNote(notes)) return true
  // Legacy: kickoff starters were sub_in @ 0 with a position code in notes.
  return timestamp <= 0 && Boolean(parseStartingLineupPosition(notes))
}

export function isPeriodEndSubEvent(
  eventType: string,
  notes: string | null | undefined,
): boolean {
  return eventType === 'sub_out' && (notes ?? '').trim() === PERIOD_END_NOTE
}

const POSITION_SWITCH_SEPARATOR = '→'

/** Wall-clock / match-clock window that collapses a pass-through positional stint. */
export const POSITION_MICRO_SHIFT_SECONDS = 20

/** Persist a positional move as `LCM→ST` so the hub can show previous and new. */
export function positionSwitchNote(
  previousPosition: string | null | undefined,
  nextPosition: string | null | undefined,
): string {
  const to = (nextPosition ?? '').trim()
  const from = (previousPosition ?? '').trim()
  if (from && to && from !== to) return `${from}${POSITION_SWITCH_SEPARATOR}${to}`
  return to
}

export function parsePositionSwitchNote(
  notes: string | null | undefined,
): { from: string | null; to: string } | null {
  const raw = (notes ?? '').trim()
  if (!raw || raw === PERIOD_END_NOTE || raw === 'starting_lineup') return null
  if (raw.startsWith(STARTING_LINEUP_NOTE_PREFIX)) return null
  if (parseOpponentGoalCategory(raw)) return null
  const arrow = raw.match(/^(.+?)\s*(?:→|->)\s*(.+)$/)
  if (arrow) {
    const from = arrow[1]!.trim()
    const to = arrow[2]!.trim()
    if (!to) return null
    return { from: from || null, to }
  }
  return { from: null, to: raw }
}

/** Mid-game sub / position-change notes store the tactical slot (ST, LCB, …). */
export function parseTacticalPositionNote(notes: string | null | undefined): string | null {
  return parsePositionSwitchNote(notes)?.to ?? null
}

/**
 * Collapse a micro-shift into the previous stint note: `LCM→ST` then `ST→CM`
 * becomes `LCM→CM` so the pass-through slot is not stored as playing time.
 */
export function mergePositionSwitchNote(
  previousNotes: string | null | undefined,
  nextPosition: string | null | undefined,
): string {
  const parsed = parsePositionSwitchNote(previousNotes)
  return positionSwitchNote(parsed?.from, nextPosition ?? parsed?.to ?? '')
}

/** True when the new assignment should UPDATE the previous row instead of INSERT. */
export function isPositionMicroShift(input: {
  previousTimestamp: number
  incomingTimestamp: number
  previousCreatedAtMs?: number
  nowMs?: number
  windowSeconds?: number
}): boolean {
  const windowSeconds = Math.max(input.windowSeconds ?? POSITION_MICRO_SHIFT_SECONDS, 1)
  if (
    input.incomingTimestamp >= input.previousTimestamp &&
    input.incomingTimestamp - input.previousTimestamp < windowSeconds
  ) {
    return true
  }
  if (input.previousCreatedAtMs == null || input.nowMs == null) return false
  return input.nowMs - input.previousCreatedAtMs < windowSeconds * 1000
}

/** Pitch slot for recap minutes — strips `starting_lineup|` and `LCM→ST`. */
export function cleanRecapPositionNote(notes: string | null | undefined): string | null {
  const raw = (notes ?? '').trim()
  if (!raw || raw === PERIOD_END_NOTE || raw === 'starting_lineup') return null
  if (raw.startsWith(STARTING_LINEUP_NOTE_PREFIX)) {
    return parseStartingLineupPosition(raw)
  }
  return parsePositionSwitchNote(raw)?.to ?? null
}
