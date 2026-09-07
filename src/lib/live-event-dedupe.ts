/** Same-device debounce for coach / sideline event taps. */
export const COACH_LIVE_EVENT_DEDUPE_MS = 15_000
/** Cross-device window enforced by the match API and `log_stat_tracker_event`. */
export const SERVER_LIVE_EVENT_DEDUPE_MS = 3_000

const lastAcceptedAt = new Map<string, number>()

export function liveEventDedupeKey(
  parts: Array<string | number | null | undefined>,
): string {
  return parts.map((part) => (part == null ? '' : String(part))).join(':')
}

export function shouldAcceptLiveEvent(
  key: string,
  nowMs = Date.now(),
  windowMs = COACH_LIVE_EVENT_DEDUPE_MS,
): boolean {
  const previous = lastAcceptedAt.get(key)
  if (previous != null && nowMs - previous < windowMs) return false
  lastAcceptedAt.set(key, nowMs)
  return true
}

export function resetLiveEventDedupeForTests() {
  lastAcceptedAt.clear()
}
