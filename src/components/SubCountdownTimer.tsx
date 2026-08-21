import { memo, useCallback, useEffect, useRef, useState } from 'react'
import { RotateCcw } from 'lucide-react'
import { ENABLE_SUB_ASSISTANT } from '@/lib/feature-flags'
import { formatSubIntervalLabel } from '@/lib/sub-rotation'
import { cn } from '@/lib/utils'

type SubCountdownTimerProps = {
  /** Planned rotation length in seconds (from setup). */
  intervalSeconds: number | null
  /** True while the live match clock is ticking. */
  running: boolean
  /** False before the half has been started. */
  periodClockStarted: boolean
  className?: string
}

/**
 * Owns its own countdown tick so parent pitch/lineup views are not re-rendered every second.
 * Pauses when the match clock is paused; resumes from remaining time when play continues.
 *
 * Archived behind ENABLE_SUB_ASSISTANT — flip that flag to restore on Game Day.
 */
export const SubCountdownTimer = memo(function SubCountdownTimer({
  intervalSeconds,
  running,
  periodClockStarted,
  className,
}: SubCountdownTimerProps) {
  const intervalRef = useRef(Math.max(0, intervalSeconds ?? 0))
  const [remainingSeconds, setRemainingSeconds] = useState(() =>
    Math.max(0, intervalSeconds ?? 0),
  )

  useEffect(() => {
    const next = Math.max(0, intervalSeconds ?? 0)
    intervalRef.current = next
    setRemainingSeconds(next)
  }, [intervalSeconds])

  // Reset when a new half begins (periodClockStarted flips true after Start Half).
  const prevStartedRef = useRef(periodClockStarted)
  useEffect(() => {
    if (periodClockStarted && !prevStartedRef.current) {
      setRemainingSeconds(intervalRef.current)
    }
    prevStartedRef.current = periodClockStarted
  }, [periodClockStarted])

  useEffect(() => {
    if (!ENABLE_SUB_ASSISTANT) return
    if (!periodClockStarted || !running || intervalRef.current <= 0) return

    const id = window.setInterval(() => {
      setRemainingSeconds((prev) => Math.max(0, prev - 1))
    }, 1000)

    return () => window.clearInterval(id)
  }, [periodClockStarted, running])

  const handleReset = useCallback(() => {
    setRemainingSeconds(intervalRef.current)
  }, [])

  if (!ENABLE_SUB_ASSISTANT) return null
  if (!intervalSeconds || intervalSeconds <= 0) return null

  const warning = remainingSeconds > 0 && remainingSeconds <= 60
  const expired = remainingSeconds === 0

  return (
    <div
      className={cn(
        'sub-countdown-timer flex items-center justify-between gap-3 rounded-xl border-2 border-border bg-card px-3 py-2.5',
        className,
      )}
      aria-live="polite"
    >
      <div className="min-w-0">
        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
          Sub countdown
        </p>
        <p
          className={cn(
            'font-display text-2xl font-black tabular-nums tracking-tight',
            expired || warning ? 'text-amber-600' : 'text-muted-foreground',
          )}
        >
          {formatSubIntervalLabel(remainingSeconds)}
        </p>
      </div>
      <button
        type="button"
        onClick={handleReset}
        className="inline-flex min-h-11 shrink-0 touch-manipulation items-center gap-1.5 rounded-lg border-2 border-border bg-secondary px-3 text-[11px] font-bold uppercase tracking-wide text-foreground active:scale-95"
      >
        <RotateCcw className="size-3.5" strokeWidth={2.5} />
        Reset Timer
      </button>
    </div>
  )
})
