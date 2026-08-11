import { useEffect } from 'react'
import { Clock, X } from 'lucide-react'
import { formatAddedTime, isInAddedTime } from '@/lib/match-clock'
import { MODAL_OVERLAY, MODAL_PANEL, TOUCH_ICON_BUTTON } from '@/lib/layout'
import { cn } from '@/lib/utils'

type EndMatchTimingModalProps = {
  open: boolean
  remainingSeconds: number
  busy?: boolean
  onEndedOnTime: () => void
  onWentToAddedTime: () => void
  onCancel: () => void
}

export function EndMatchTimingModal({
  open,
  remainingSeconds,
  busy = false,
  onEndedOnTime,
  onWentToAddedTime,
  onCancel,
}: EndMatchTimingModalProps) {
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, busy, onCancel])

  if (!open) return null

  const inAddedTime = isInAddedTime(remainingSeconds)
  const addedLabel = formatAddedTime(remainingSeconds)

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="end-match-timing-title"
      aria-describedby="end-match-timing-description"
      className={MODAL_OVERLAY}
      onClick={() => {
        if (!busy) onCancel()
      }}
    >
      <div
        className={cn(MODAL_PANEL, 'end-match-timing-dialog border-2 border-border')}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b-2 border-border px-5 pb-3 pt-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
              <Clock className="size-4 text-athletic" strokeWidth={2.5} />
              Full time
            </div>
            <h2
              id="end-match-timing-title"
              className="mt-1 font-display text-2xl font-black uppercase tracking-wide text-foreground"
            >
              How did the game end?
            </h2>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            aria-label="Cancel"
            className={cn(
              TOUCH_ICON_BUTTON,
              'border-2 border-border bg-secondary text-foreground disabled:opacity-50',
            )}
          >
            <X className="size-5" strokeWidth={2.5} />
          </button>
        </div>

        <div className="space-y-3 px-5 py-4">
          <p
            id="end-match-timing-description"
            className="text-sm font-semibold leading-relaxed text-foreground"
          >
            Player minutes and goals already logged stay as tracked. This just records whether the
            referee ended on time or played added time.
          </p>
          {inAddedTime ? (
            <p className="rounded-xl border-2 border-athletic/50 bg-athletic/10 px-3 py-2 text-sm font-bold text-foreground">
              Clock currently in added time: {addedLabel}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-2 border-t-2 border-border px-5 py-4">
          <button
            type="button"
            onClick={onEndedOnTime}
            disabled={busy}
            className="end-match-timing-on-time min-h-14 touch-manipulation rounded-xl border-2 border-neon bg-neon px-4 py-3 text-sm font-bold uppercase tracking-wide text-neon-foreground active:scale-[0.98] disabled:opacity-50"
          >
            {busy ? 'Saving…' : 'Ended on time'}
          </button>
          <button
            type="button"
            onClick={onWentToAddedTime}
            disabled={busy}
            className="end-match-timing-added min-h-14 touch-manipulation rounded-xl border-2 border-athletic bg-athletic/15 px-4 py-3 text-sm font-bold uppercase tracking-wide text-athletic active:scale-[0.98] disabled:opacity-50"
          >
            {busy
              ? 'Saving…'
              : inAddedTime
                ? `Went to added time (${addedLabel})`
                : 'Went to added time'}
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="min-h-11 touch-manipulation rounded-xl border-2 border-border bg-card px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-muted-foreground active:scale-[0.98] disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
