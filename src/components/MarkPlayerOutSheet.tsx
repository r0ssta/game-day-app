import { X } from 'lucide-react'
import type { AbsenceReason } from '@/types/match'

const REASONS: Array<{ reason: AbsenceReason | null; label: string; detail: string }> = [
  { reason: 'injured', label: 'Injured', detail: 'They cannot continue' },
  { reason: 'left_early', label: 'Left early', detail: 'They had to go' },
  { reason: null, label: 'Out', detail: 'No reason' },
]

export function MarkPlayerOutSheet({
  playerName,
  onChoose,
  onClose,
}: {
  playerName: string
  onChoose: (reason: AbsenceReason | null) => void
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Mark ${playerName} out`}
        className="relative z-10 w-full max-w-lg rounded-t-2xl border border-border bg-card p-4 shadow-2xl sm:rounded-2xl"
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h3 className="font-display text-lg font-bold uppercase tracking-wide text-foreground">
              Mark out
            </h3>
            <p className="text-sm font-semibold text-muted-foreground">{playerName}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex size-11 items-center justify-center rounded-lg bg-secondary text-foreground active:scale-95"
            aria-label="Close mark out sheet"
          >
            <X className="size-5" />
          </button>
        </div>
        <div className="space-y-2">
          {REASONS.map((option) => (
            <button
              key={option.label}
              type="button"
              onClick={() => onChoose(option.reason)}
              className="flex min-h-14 w-full touch-manipulation flex-col items-start justify-center rounded-xl border-2 border-border bg-secondary/40 px-4 py-3 text-left active:scale-[0.98] active:border-danger/50"
            >
              <span className="text-sm font-black uppercase tracking-wide text-foreground">
                {option.label}
              </span>
              <span className="text-xs font-semibold text-muted-foreground">{option.detail}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
