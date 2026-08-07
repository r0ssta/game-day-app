/** Remaining seconds in the current half (countdown display value). */

export const QA_SPEED_MULTIPLIERS = [1, 50, 100] as const
export type QaSpeedMultiplier = (typeof QA_SPEED_MULTIPLIERS)[number]

export function halfDurationSeconds(halfLengthMinutes: number): number {
  return halfLengthMinutes * 60
}

export function elapsedInHalf(remainingSeconds: number, halfLengthMinutes: number): number {
  return Math.max(0, halfDurationSeconds(halfLengthMinutes) - remainingSeconds)
}

export function isHalfExpired(remainingSeconds: number): boolean {
  return remainingSeconds <= 0
}

export function initialHalfClock(halfLengthMinutes: number): number {
  return halfDurationSeconds(halfLengthMinutes)
}

/** Advance the countdown by one real-world tick at the given QA speed multiplier. */
export function tickCountdownClock(
  remainingSeconds: number,
  speedMultiplier: QaSpeedMultiplier,
): number {
  return Math.max(0, remainingSeconds - speedMultiplier)
}
