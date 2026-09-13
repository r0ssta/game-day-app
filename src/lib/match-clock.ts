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

export const MIN_HALF_LENGTH_MINUTES = 5
export const MAX_HALF_LENGTH_MINUTES = 90
export const HALF_LENGTH_STEP_MINUTES = 5

export function clampHalfLengthMinutes(value: number): number {
  if (!Number.isFinite(value)) return MIN_HALF_LENGTH_MINUTES
  return Math.min(MAX_HALF_LENGTH_MINUTES, Math.max(MIN_HALF_LENGTH_MINUTES, Math.round(value)))
}

/** Remaining seconds for a given elapsed stint. May be negative in added time. */
export function remainingFromElapsed(
  elapsedSeconds: number,
  halfLengthMinutes: number,
): number {
  return halfDurationSeconds(halfLengthMinutes) - elapsedSeconds
}

/**
 * Rebuild remaining time after a mid-period half-length change.
 * Elapsed (including added time) is preserved; only the regulation threshold moves.
 */
export function remainingAfterHalfLengthChange(
  currentRemaining: number,
  previousMinutes: number,
  nextMinutes: number,
): number {
  return remainingFromElapsed(elapsedInHalf(currentRemaining, previousMinutes), nextMinutes)
}

/** Elapsed match seconds from a period start timestamp. */
export function elapsedFromHalfStart(
  halfStartTimeMs: number,
  nowMs: number,
  options?: { speedMultiplier?: number },
): number {
  const speed = options?.speedMultiplier ?? 1
  return Math.floor(((nowMs - halfStartTimeMs) / 1000) * speed)
}

/**
 * Live remaining time from `now` vs the period start timestamp.
 * Changing `halfLengthMinutes` adjusts remaining without touching elapsed.
 */
export function remainingFromHalfStart(
  halfStartTimeMs: number,
  halfLengthMinutes: number,
  nowMs: number,
  options?: { speedMultiplier?: number },
): number {
  return remainingFromElapsed(
    elapsedFromHalfStart(halfStartTimeMs, nowMs, options),
    halfLengthMinutes,
  )
}

/** Reconstruct the period-start epoch so `now - start` matches current elapsed. */
export function halfStartTimeFromRemaining(
  remainingSeconds: number,
  halfLengthMinutes: number,
  nowMs: number,
  options?: { speedMultiplier?: number },
): number {
  const elapsed = elapsedInHalf(remainingSeconds, halfLengthMinutes)
  const speed = options?.speedMultiplier ?? 1
  return nowMs - (elapsed * 1000) / speed
}

export type PeriodClockAnchor = {
  periodStartTime: string | null
  accumulatedSecondsBeforePause: number
}

export function emptyPeriodClockAnchor(): PeriodClockAnchor {
  return { periodStartTime: null, accumulatedSecondsBeforePause: 0 }
}

export function kickoffPeriodClockAnchor(nowMs = Date.now()): PeriodClockAnchor {
  return {
    periodStartTime: new Date(nowMs).toISOString(),
    accumulatedSecondsBeforePause: 0,
  }
}

export function parsePeriodStartTimeMs(
  value: string | number | Date | null | undefined,
): number | null {
  if (value == null || value === '') return null
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  const ms = new Date(value).getTime()
  return Number.isFinite(ms) ? ms : null
}

/**
 * Absolute elapsed seconds: banked pause time plus `now - period_start_time`
 * while the clock is running. Does not increment a local counter.
 */
export function elapsedFromPeriodAnchor(input: {
  periodStartTime: string | number | Date | null
  accumulatedSecondsBeforePause?: number
  nowMs: number
  running?: boolean
  speedMultiplier?: number
}): number {
  const accumulated = Math.max(0, Math.floor(input.accumulatedSecondsBeforePause ?? 0))
  if (input.running === false) return accumulated
  const startMs = parsePeriodStartTimeMs(input.periodStartTime)
  if (startMs == null) return accumulated
  const speed = input.speedMultiplier ?? 1
  return accumulated + Math.floor(((input.nowMs - startMs) / 1000) * speed)
}

export function remainingFromPeriodAnchor(input: {
  periodStartTime: string | number | Date | null
  accumulatedSecondsBeforePause?: number
  halfLengthMinutes: number
  nowMs: number
  running?: boolean
  speedMultiplier?: number
}): number {
  return remainingFromElapsed(elapsedFromPeriodAnchor(input), input.halfLengthMinutes)
}

export function pausePeriodClock(input: {
  periodStartTime: string | number | Date | null
  accumulatedSecondsBeforePause?: number
  nowMs: number
  speedMultiplier?: number
}): PeriodClockAnchor {
  return {
    periodStartTime: input.periodStartTime
      ? new Date(parsePeriodStartTimeMs(input.periodStartTime) ?? input.nowMs).toISOString()
      : null,
    accumulatedSecondsBeforePause: elapsedFromPeriodAnchor({
      ...input,
      running: true,
    }),
  }
}

export function resumePeriodClock(
  accumulatedSecondsBeforePause: number,
  nowMs = Date.now(),
): PeriodClockAnchor {
  return {
    periodStartTime: new Date(nowMs).toISOString(),
    accumulatedSecondsBeforePause: Math.max(0, Math.floor(accumulatedSecondsBeforePause)),
  }
}

export function resolveLiveMatchClock(input: {
  periodStartTime?: string | null
  accumulatedSecondsBeforePause?: number | null
  clockSeconds: number
  addedTimeSeconds?: number
  periodClockStarted: boolean
  halfLengthMinutes: number
  nowMs: number
  running?: boolean
}): {
  remaining: number
  periodStartTime: string | null
  accumulatedSecondsBeforePause: number
} {
  const restored = restoreMatchClockSeconds(input.clockSeconds, input.addedTimeSeconds)
  const accumulated = Math.max(0, Math.floor(input.accumulatedSecondsBeforePause ?? 0))
  const periodStartTime = input.periodStartTime ?? null

  if (!input.periodClockStarted) {
    return {
      remaining: restored,
      periodStartTime: null,
      accumulatedSecondsBeforePause: 0,
    }
  }

  if (parsePeriodStartTimeMs(periodStartTime) != null) {
    return {
      remaining: remainingFromPeriodAnchor({
        periodStartTime,
        accumulatedSecondsBeforePause: accumulated,
        halfLengthMinutes: input.halfLengthMinutes,
        nowMs: input.nowMs,
        running: input.running ?? true,
      }),
      periodStartTime,
      accumulatedSecondsBeforePause: accumulated,
    }
  }

  return {
    remaining: restored,
    periodStartTime: new Date(
      halfStartTimeFromRemaining(restored, input.halfLengthMinutes, input.nowMs),
    ).toISOString(),
    accumulatedSecondsBeforePause: 0,
  }
}

export function planHalfLengthOverride(input: {
  nextMinutes: number
  previousMinutes: number
  remainingSeconds: number
  halfStartTimeMs: number | null
  nowMs: number
  speedMultiplier?: number
  periodClockStarted: boolean
}): {
  nextMinutes: number
  nextRemaining: number
  halfStartTimeMs: number | null
} {
  const nextMinutes = clampHalfLengthMinutes(input.nextMinutes)
  if (!input.periodClockStarted) {
    return {
      nextMinutes,
      nextRemaining: initialHalfClock(nextMinutes),
      halfStartTimeMs: null,
    }
  }

  const elapsed =
    input.halfStartTimeMs != null
      ? elapsedFromHalfStart(input.halfStartTimeMs, input.nowMs, {
          speedMultiplier: input.speedMultiplier,
        })
      : elapsedInHalf(input.remainingSeconds, input.previousMinutes)

  const nextRemaining = remainingFromElapsed(elapsed, nextMinutes)
  const halfStartTimeMs =
    input.halfStartTimeMs ??
    halfStartTimeFromRemaining(nextRemaining, nextMinutes, input.nowMs, {
      speedMultiplier: input.speedMultiplier,
    })

  return { nextMinutes, nextRemaining, halfStartTimeMs }
}

/**
 * Period kickoff must start on a full countdown. A leftover 0:00 (or a
 * snapshot that snapped to 0 before the whistle) would write event
 * timestamps as "already past a full half" and inflate recap minutes.
 */
export function resolvePeriodKickoffRemaining(
  currentRemaining: number,
  halfLengthMinutes: number,
): number {
  const full = initialHalfClock(halfLengthMinutes)
  if (currentRemaining <= 0 || currentRemaining > full) return full
  return currentRemaining
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
