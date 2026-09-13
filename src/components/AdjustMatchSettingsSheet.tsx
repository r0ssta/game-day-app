import { useEffect, useState } from 'react'
import { Clock, Minus, Plus, X } from 'lucide-react'
import {
  clampHalfLengthMinutes,
  formatClock,
  HALF_LENGTH_STEP_MINUTES,
  initialHalfClock,
  MAX_HALF_LENGTH_MINUTES,
  MIN_HALF_LENGTH_MINUTES,
  persistableClockSeconds,
  remainingAfterHalfLengthChange,
} from '@/lib/match-clock'
import { formatPeriodLong, type TotalPeriods } from '@/lib/match-periods'
import { MODAL_OVERLAY, MODAL_PANEL, TOUCH_ICON_BUTTON } from '@/lib/layout'
import { cn } from '@/lib/utils'

type AdjustMatchSettingsSheetProps = {
  open: boolean
  halfLengthMinutes: number
  remainingSeconds: number
  periodClockStarted: boolean
  currentPeriod: number
  totalPeriods: TotalPeriods
  busy?: boolean
  onSave: (nextMinutes: number) => void
  onClose: () => void
}

export function AdjustMatchSettingsSheet({
  open,
  halfLengthMinutes,
  remainingSeconds,
  periodClockStarted,
  currentPeriod,
  totalPeriods,
  busy = false,
  onSave,
  onClose,
}: AdjustMatchSettingsSheetProps) {
  const [draft, setDraft] = useState(halfLengthMinutes)

  useEffect(() => {
    if (open) setDraft(halfLengthMinutes)
  }, [open, halfLengthMinutes])

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, busy, onClose])

  if (!open) return null

  const lengthLabel = totalPeriods === 3 ? 'Period length' : 'Half length'
  const nextRemaining = periodClockStarted
    ? remainingAfterHalfLengthChange(remainingSeconds, halfLengthMinutes, draft)
    : initialHalfClock(draft)
  const previewClock = formatClock(persistableClockSeconds(nextRemaining))
  const periodLabel = formatPeriodLong(currentPeriod, totalPeriods)
  const canDecrement = draft - HALF_LENGTH_STEP_MINUTES >= MIN_HALF_LENGTH_MINUTES
  const canIncrement = draft + HALF_LENGTH_STEP_MINUTES <= MAX_HALF_LENGTH_MINUTES
  const unchanged = draft === halfLengthMinutes

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="adjust-match-settings-title"
      className={MODAL_OVERLAY}
      onClick={() => {
        if (!busy) onClose()
      }}
    >
      <div
        className={cn(MODAL_PANEL, 'border-2 border-border')}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b-2 border-border px-5 pb-3 pt-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
              <Clock className="size-4 text-neon" strokeWidth={2.5} />
              Live match
            </div>
            <h2
              id="adjust-match-settings-title"
              className="mt-1 font-display text-2xl font-black uppercase tracking-wide text-foreground"
            >
              Adjust Match Settings
            </h2>
            <p className="mt-1 text-sm font-semibold text-muted-foreground">
              {periodLabel} · elapsed time stays put
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="Close"
            className={cn(
              TOUCH_ICON_BUTTON,
              'border-2 border-border bg-secondary text-foreground disabled:opacity-50',
            )}
          >
            <X className="size-5" strokeWidth={2.5} />
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          <div>
            <label
              htmlFor="half-length-override"
              className="mb-1.5 block text-xs font-bold uppercase tracking-widest text-muted-foreground"
            >
              {lengthLabel} (minutes)
            </label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={busy || !canDecrement}
                aria-label={`Decrease by ${HALF_LENGTH_STEP_MINUTES} minutes`}
                onClick={() =>
                  setDraft((value) => clampHalfLengthMinutes(value - HALF_LENGTH_STEP_MINUTES))
                }
                className="flex size-12 shrink-0 touch-manipulation items-center justify-center rounded-xl border-2 border-border bg-secondary text-foreground active:scale-[0.98] disabled:opacity-40"
              >
                <Minus className="size-5" strokeWidth={2.5} />
              </button>
              <input
                id="half-length-override"
                type="number"
                inputMode="numeric"
                min={MIN_HALF_LENGTH_MINUTES}
                max={MAX_HALF_LENGTH_MINUTES}
                step={1}
                value={draft}
                disabled={busy}
                onChange={(event) => {
                  const next = Number(event.target.value)
                  if (!Number.isFinite(next)) return
                  setDraft(clampHalfLengthMinutes(next))
                }}
                className="min-h-12 w-full rounded-xl border-2 border-border bg-background px-3 text-center font-display text-3xl font-black tabular-nums text-foreground focus:border-neon focus:outline-none focus:ring-2 focus:ring-neon/30 disabled:opacity-50"
              />
              <button
                type="button"
                disabled={busy || !canIncrement}
                aria-label={`Increase by ${HALF_LENGTH_STEP_MINUTES} minutes`}
                onClick={() =>
                  setDraft((value) => clampHalfLengthMinutes(value + HALF_LENGTH_STEP_MINUTES))
                }
                className="flex size-12 shrink-0 touch-manipulation items-center justify-center rounded-xl border-2 border-border bg-secondary text-foreground active:scale-[0.98] disabled:opacity-40"
              >
                <Plus className="size-5" strokeWidth={2.5} />
              </button>
            </div>
            <p className="mt-2 text-center text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
              {periodClockStarted
                ? `Clock will show ${previewClock} remaining`
                : `Ready clock will show ${previewClock}`}
            </p>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy || unchanged}
              onClick={() => onSave(draft)}
              className="min-h-12 flex-1 touch-manipulation rounded-xl border-2 border-neon bg-neon px-3 text-xs font-black uppercase tracking-wide text-neon-foreground active:scale-[0.98] disabled:opacity-50"
            >
              {busy ? 'Saving…' : 'Save'}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={onClose}
              className="min-h-12 flex-1 touch-manipulation rounded-xl border-2 border-border bg-background px-3 text-xs font-black uppercase tracking-wide text-foreground active:scale-[0.98] disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
