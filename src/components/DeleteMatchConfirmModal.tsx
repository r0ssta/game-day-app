import { useEffect } from 'react'
import { AlertTriangle, X } from 'lucide-react'
import { MODAL_OVERLAY, MODAL_PANEL, TOUCH_ICON_BUTTON } from '@/lib/layout'
import { cn } from '@/lib/utils'

type DeleteMatchConfirmModalProps = {
  open: boolean
  matchLabel?: string
  busy?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function DeleteMatchConfirmModal({
  open,
  matchLabel,
  busy = false,
  onConfirm,
  onCancel,
}: DeleteMatchConfirmModalProps) {
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, busy, onCancel])

  if (!open) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-match-title"
      aria-describedby="delete-match-description"
      className={MODAL_OVERLAY}
      onClick={() => {
        if (!busy) onCancel()
      }}
    >
      <div
        className={cn(MODAL_PANEL, 'delete-match-dialog border-2 border-danger')}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b-2 border-danger/30 px-5 pb-3 pt-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-danger">
              <AlertTriangle className="size-4" strokeWidth={2.5} />
              Destructive action
            </div>
            <h2
              id="delete-match-title"
              className="mt-1 font-display text-2xl font-black uppercase tracking-wide text-foreground"
            >
              Delete Game?
            </h2>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            aria-label="Cancel delete"
            className={cn(
              TOUCH_ICON_BUTTON,
              'border-2 border-border bg-secondary text-foreground disabled:opacity-50',
            )}
          >
            <X className="size-5" strokeWidth={2.5} />
          </button>
        </div>

        <div className="space-y-3 px-5 py-4">
          <p id="delete-match-description" className="text-sm font-semibold leading-relaxed text-foreground">
            Are you sure you want to delete this match and all associated events?
          </p>
          {matchLabel ? (
            <p className="rounded-xl border-2 border-border bg-secondary/40 px-3 py-2 text-sm font-bold text-foreground">
              {matchLabel}
            </p>
          ) : null}
          <p className="text-xs font-semibold leading-relaxed text-muted-foreground">
            This permanently removes the match record, live tracking logs, events, stats, and
            post-game recaps. This cannot be undone.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2 border-t-2 border-border px-5 py-4">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="min-h-12 touch-manipulation rounded-xl border-2 border-border bg-card px-4 py-3 text-sm font-bold uppercase tracking-wide text-foreground active:scale-[0.98] disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="delete-match-confirm min-h-12 touch-manipulation rounded-xl border-2 border-danger bg-danger px-4 py-3 text-sm font-bold uppercase tracking-wide text-danger-foreground shadow-lg shadow-danger/20 active:scale-[0.98] disabled:opacity-50"
          >
            {busy ? 'Deleting…' : 'Delete Game'}
          </button>
        </div>
      </div>
    </div>
  )
}
