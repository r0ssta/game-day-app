import { useCallback, useEffect, useRef } from 'react'
import {
  parsePeriodStartTimeMs,
  remainingFromPeriodAnchor,
  type QaSpeedMultiplier,
} from '@/lib/match-clock'

type UseMatchClockInput = {
  enabled: boolean
  periodStartTime: string | null
  accumulatedSecondsBeforePause: number
  halfLengthMinutes: number
  running: boolean
  periodClockStarted: boolean
  speedMultiplier?: QaSpeedMultiplier
  setSeconds: (next: number) => void
}

/**
 * Live match countdown from absolute timestamps — never `prev + 1`.
 * Backgrounded iOS/Android PWAs freeze `setInterval`; waking recalculates
 * `now - period_start_time` so the face snaps to the correct remaining time.
 */
export function useMatchClock({
  enabled,
  periodStartTime,
  accumulatedSecondsBeforePause,
  halfLengthMinutes,
  running,
  periodClockStarted,
  speedMultiplier = 1,
  setSeconds,
}: UseMatchClockInput) {
  const speedRef = useRef(speedMultiplier)
  const startOverrideMsRef = useRef<number | null>(null)
  const periodStartTimeRef = useRef(periodStartTime)
  periodStartTimeRef.current = periodStartTime

  useEffect(() => {
    startOverrideMsRef.current = null
  }, [periodStartTime])

  useEffect(() => {
    if (speedRef.current === speedMultiplier) return
    const now = Date.now()
    const startMs = startOverrideMsRef.current ?? parsePeriodStartTimeMs(periodStartTimeRef.current)
    if (startMs != null) {
      const elapsed = Math.floor(((now - startMs) / 1000) * speedRef.current)
      startOverrideMsRef.current = now - (elapsed * 1000) / speedMultiplier
    }
    speedRef.current = speedMultiplier
  }, [speedMultiplier])

  const deriveRemaining = useCallback(
    (nowMs = Date.now()) => {
      const start =
        startOverrideMsRef.current ?? parsePeriodStartTimeMs(periodStartTime)
      return remainingFromPeriodAnchor({
        periodStartTime: start,
        accumulatedSecondsBeforePause,
        halfLengthMinutes,
        nowMs,
        running,
        speedMultiplier: speedRef.current,
      })
    },
    [accumulatedSecondsBeforePause, halfLengthMinutes, periodStartTime, running],
  )

  const snap = useCallback(() => {
    if (!periodClockStarted) return
    setSeconds(deriveRemaining())
  }, [deriveRemaining, periodClockStarted, setSeconds])

  useEffect(() => {
    if (!enabled || !periodClockStarted) return
    snap()
    if (!running) return
    const id = window.setInterval(snap, 1000)
    return () => window.clearInterval(id)
  }, [enabled, periodClockStarted, running, snap])

  useEffect(() => {
    if (!enabled) return
    const wake = () => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return
      snap()
    }
    document.addEventListener('visibilitychange', wake)
    window.addEventListener('pageshow', wake)
    return () => {
      document.removeEventListener('visibilitychange', wake)
      window.removeEventListener('pageshow', wake)
    }
  }, [enabled, snap])
}
