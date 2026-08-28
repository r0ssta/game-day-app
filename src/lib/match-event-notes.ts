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

export function isStartingLineupEvent(
  eventType: string,
  notes: string | null | undefined,
  timestamp: number,
): boolean {
  if (eventType !== 'sub_in') return false
  const raw = (notes ?? '').trim()
  if (raw.startsWith(STARTING_LINEUP_NOTE_PREFIX) || raw === 'starting_lineup') return true
  // Legacy: kickoff starters were sub_in @ 0 with a position code in notes.
  return timestamp <= 0 && Boolean(parseStartingLineupPosition(raw))
}

export function isPeriodEndSubEvent(
  eventType: string,
  notes: string | null | undefined,
): boolean {
  return eventType === 'sub_out' && (notes ?? '').trim() === PERIOD_END_NOTE
}
