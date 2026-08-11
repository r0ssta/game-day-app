/** Remaining seconds in the current half (countdown). May go negative in added time. */

export const QA_SPEED_MULTIPLIERS = [1, 50, 100] as const
export type QaSpeedMultiplier = (typeof QA_SPEED_MULTIPLIERS)[number]

export function halfDurationSeconds(halfLengthMinutes: number): number {
  return halfLengthMinutes * 60
}

export function elapsedInHalf(remainingSeconds: number, halfLengthMinutes: number): number {
  return Math.max(0, halfDurationSeconds(halfLengthMinutes) - remainingSeconds)
}

/** Regulation has elapsed (clock at or past 0:00). Does not mean the clock is frozen. */
export function isHalfExpired(remainingSeconds: number): boolean {
  return remainingSeconds <= 0
}

export function isInAddedTime(remainingSeconds: number): boolean {
  return remainingSeconds < 0
}

/** Seconds past regulation; 0 when still in regulation or exactly at 0:00. */
export function addedTimeSeconds(remainingSeconds: number): number {
  return remainingSeconds < 0 ? -remainingSeconds : 0
}

export function initialHalfClock(halfLengthMinutes: number): number {
  return halfDurationSeconds(halfLengthMinutes)
}

/** Advance the countdown by one real-world tick. Allows negative remaining (added time). */
export function tickCountdownClock(
  remainingSeconds: number,
  speedMultiplier: QaSpeedMultiplier,
): number {
  return remainingSeconds - speedMultiplier
}

/** DB-safe clock_seconds value (column is constrained >= 0). */
export function persistableClockSeconds(remainingSeconds: number): number {
  return Math.max(0, remainingSeconds)
}

/**
 * Rebuild in-memory remaining seconds after loading from DB.
 * OT is stored as clock_seconds=0 + qualitative_context.addedTimeSeconds.
 */
export function restoreMatchClockSeconds(
  persistedClockSeconds: number,
  persistedAddedTimeSeconds = 0,
): number {
  if (persistedClockSeconds > 0) return persistedClockSeconds
  if (persistedAddedTimeSeconds > 0) return -persistedAddedTimeSeconds
  return persistedClockSeconds
}

export function formatClock(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds))
  const m = Math.floor(safe / 60)
  const s = safe % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

/** Format added time as +M:SS (empty string when not in OT). */
export function formatAddedTime(remainingSeconds: number): string {
  const added = addedTimeSeconds(remainingSeconds)
  if (added <= 0) return ''
  const m = Math.floor(added / 60)
  const s = added % 60
  return `+${m}:${String(s).padStart(2, '0')}`
}

/** Regulation face clock (never negative) plus optional +OT label. */
export function formatMatchClockParts(remainingSeconds: number): {
  regulation: string
  addedLabel: string
  inAddedTime: boolean
} {
  return {
    regulation: formatClock(persistableClockSeconds(remainingSeconds)),
    addedLabel: formatAddedTime(remainingSeconds),
    inAddedTime: isInAddedTime(remainingSeconds),
  }
}
