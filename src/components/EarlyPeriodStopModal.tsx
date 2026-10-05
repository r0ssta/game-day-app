import { useEffect } from 'react'
import { Clock, X } from 'lucide-react'
import { MODAL_OVERLAY, MODAL_PANEL, TOUCH_ICON_BUTTON } from '@/lib/layout'
import { cn } from '@/lib/utils'

type EarlyPeriodStopModalProps = {
  open: boolean
  title: string
  description: string
  confirmLabel: string
  onConfirm: () => void
  onCancel: () => void
}

export function EarlyPeriodStopModal({
  open,
  title,
  description,
  confirmLabel,
  onConfirm,
  onCancel,
}: EarlyPeriodStopModalProps) {
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onCancel])

  if (!open) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="early-period-stop-title"
      aria-describedby="early-period-stop-description"
      className={MODAL_OVERLAY}
      onClick={onCancel}
    >
      <div
        className={cn(MODAL_PANEL, 'early-period-stop-dialog border-2 border-orange-600')}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b-2 border-orange-600/30 px-5 pb-3 pt-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-orange-600">
              <Clock className="size-4" strokeWidth={2.5} />
              Time left
            </div>
            <h2
              id="early-period-stop-title"
              className="mt-1 font-display text-2xl font-black uppercase tracking-wide text-foreground"
            >
              {title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Keep playing"
            className={cn(
              TOUCH_ICON_BUTTON,
              'border-2 border-border bg-secondary text-foreground',
            )}
          >
            <X className="size-5" strokeWidth={2.5} />
          </button>
        </div>

        <div className="px-5 py-4">
          <p
            id="early-period-stop-description"
            className="text-sm font-semibold leading-relaxed text-foreground"
          >
            {description}
          </p>
        </div>

        <div className="flex flex-col gap-2 border-t-2 border-border px-5 py-4">
          <button
            type="button"
            onClick={onConfirm}
            className="early-period-stop-confirm min-h-14 touch-manipulation rounded-xl border-2 border-orange-600 bg-orange-600 px-4 py-3 text-sm font-bold uppercase tracking-wide text-white active:scale-[0.98]"
          >
            {confirmLabel}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="early-period-stop-cancel min-h-14 touch-manipulation rounded-xl border-2 border-border bg-card px-4 py-3 text-sm font-bold uppercase tracking-wide text-foreground active:scale-[0.98]"
          >
            Keep playing
          </button>
        </div>
      </div>
    </div>
  )
}
