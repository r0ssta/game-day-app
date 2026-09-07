import { useEffect, useState } from 'react'
import { Clock, X } from 'lucide-react'
import { MODAL_OVERLAY, MODAL_PANEL, TOUCH_ICON_BUTTON } from '@/lib/layout'
import { cn } from '@/lib/utils'

const EXTRA_TIME_LENGTH_OPTIONS = [5, 10, 15] as const

type TiedGameModalProps = {
  open: boolean
  homeScore: number
  awayScore: number
  busy?: boolean
  onSelectExtraTime: (halfMinutes: number) => void
  onSelectPenaltyShootout: () => void
  onCancel: () => void
}

export function TiedGameModal({
  open,
  homeScore,
  awayScore,
  busy = false,
  onSelectExtraTime,
  onSelectPenaltyShootout,
  onCancel,
}: TiedGameModalProps) {
  const [step, setStep] = useState<'choose' | 'extra_time'>('choose')
  const [halfMinutes, setHalfMinutes] = useState(5)

  useEffect(() => {
    if (!open) {
      setStep('choose')
      setHalfMinutes(5)
      return
    }
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
      aria-labelledby="tied-game-title"
      className={MODAL_OVERLAY}
      onClick={() => {
        if (!busy) onCancel()
      }}
    >
      <div
        className={cn(MODAL_PANEL, 'tied-game-dialog border-2 border-border')}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b-2 border-border px-5 pb-3 pt-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
              <Clock className="size-4 text-athletic" strokeWidth={2.5} />
              Tied {homeScore}–{awayScore}
            </div>
            <h2
              id="tied-game-title"
              className="mt-1 font-display text-2xl font-black uppercase tracking-wide text-foreground"
            >
              {step === 'choose'
                ? 'Match Tied. Proceed to Extra Time or Penalty Shootout?'
                : 'Extra time length'}
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

        {step === 'choose' ? (
          <div className="flex flex-col gap-2 px-5 py-4">
            <button
              type="button"
              disabled={busy}
              onClick={() => setStep('extra_time')}
              className="min-h-14 touch-manipulation rounded-xl border-2 border-neon bg-neon px-4 py-3 text-sm font-bold uppercase tracking-wide text-neon-foreground active:scale-[0.98] disabled:opacity-50"
            >
              Extra Time
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={onSelectPenaltyShootout}
              className="min-h-14 touch-manipulation rounded-xl border-2 border-athletic bg-athletic/15 px-4 py-3 text-sm font-bold uppercase tracking-wide text-athletic active:scale-[0.98] disabled:opacity-50"
            >
              {busy ? 'Saving…' : 'Penalty Shootout'}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={onCancel}
              className="min-h-11 touch-manipulation rounded-xl border-2 border-border bg-card px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-muted-foreground active:scale-[0.98] disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        ) : (
          <div className="space-y-3 px-5 py-4">
            <p className="text-sm font-semibold text-foreground">
              How long should each extra-time half be?
            </p>
            <div className="grid grid-cols-3 gap-2">
              {EXTRA_TIME_LENGTH_OPTIONS.map((minutes) => (
                <button
                  key={minutes}
                  type="button"
                  disabled={busy}
                  onClick={() => setHalfMinutes(minutes)}
                  className={cn(
                    'min-h-12 touch-manipulation rounded-xl border-2 text-sm font-black uppercase tracking-wide active:scale-[0.98] disabled:opacity-50',
                    halfMinutes === minutes
                      ? 'border-neon bg-neon text-neon-foreground'
                      : 'border-border bg-card text-foreground',
                  )}
                >
                  {minutes} min
                </button>
              ))}
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={() => onSelectExtraTime(halfMinutes)}
              className="min-h-14 w-full touch-manipulation rounded-xl border-2 border-neon bg-neon px-4 py-3 text-sm font-bold uppercase tracking-wide text-neon-foreground active:scale-[0.98] disabled:opacity-50"
            >
              {busy ? 'Saving…' : `Start Extra Time (${halfMinutes} min halves)`}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setStep('choose')}
              className="min-h-11 w-full touch-manipulation rounded-xl border-2 border-border bg-card px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-muted-foreground active:scale-[0.98] disabled:opacity-50"
            >
              Back
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
