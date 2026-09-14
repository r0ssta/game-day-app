import {
  OPPONENT_STRENGTH_OPTIONS,
  type OpponentStrength,
} from '@/lib/opponent-strength'
import { cn } from '@/lib/utils'

export function OpponentStrengthToggle({
  value,
  onChange,
  allowClear = false,
}: {
  value: OpponentStrength | null
  onChange: (value: OpponentStrength | null) => void
  allowClear?: boolean
}) {
  return (
    <div>
      <span className="mb-2 block text-xs font-bold uppercase tracking-widest text-muted-foreground">
        Opponent Strength
      </span>
      <p className="mb-2 text-xs text-muted-foreground">
        After the whistle — used for Weighted Impact (WPI). Skip if you are unsure.
      </p>
      <div
        role="group"
        aria-label="Opponent strength"
        className="grid grid-cols-3 gap-1 rounded-xl border border-border bg-card p-1"
      >
        {OPPONENT_STRENGTH_OPTIONS.map((option) => {
          const selected = value === option.id
          return (
            <button
              key={option.id}
              type="button"
              aria-pressed={selected}
              aria-label={`${option.label}: ${option.description}`}
              onClick={() => {
                if (selected && allowClear) {
                  onChange(null)
                  return
                }
                onChange(option.id)
              }}
              className={cn(
                'flex min-h-12 flex-col items-center justify-center rounded-lg px-1 py-2 text-center transition-colors active:scale-[0.98]',
                selected
                  ? 'bg-neon text-neon-foreground shadow-sm'
                  : 'text-muted-foreground',
              )}
            >
              <span className="text-sm font-bold uppercase tracking-wide">{option.label}</span>
              <span
                className={cn(
                  'text-[10px] font-semibold leading-tight',
                  selected ? 'text-neon-foreground/80' : 'text-muted-foreground',
                )}
              >
                {option.description}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
