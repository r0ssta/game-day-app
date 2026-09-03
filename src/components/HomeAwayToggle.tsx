import { cn } from '@/lib/utils'
import type { LocationType } from '@/lib/match-location'
import { formatVenueLabel } from '@/lib/match-location'

export function HomeAwayToggle({
  value,
  onChange,
}: {
  value: LocationType
  onChange: (value: LocationType) => void
}) {
  return (
    <div>
      <span className="mb-2 block text-xs font-bold uppercase tracking-widest text-muted-foreground">
        Home / Away
      </span>
      <div
        role="group"
        aria-label="Home or Away"
        className="grid grid-cols-2 gap-1 rounded-xl border border-border bg-card p-1"
      >
        {(['home', 'away'] as const).map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={value === option}
            onClick={() => onChange(option)}
            className={cn(
              'rounded-lg py-3 text-sm font-bold uppercase tracking-wide transition-colors active:scale-[0.98]',
              value === option
                ? option === 'home'
                  ? 'bg-neon text-neon-foreground shadow-sm'
                  : 'bg-athletic text-athletic-foreground shadow-sm'
                : 'text-muted-foreground',
            )}
          >
            {formatVenueLabel(option)}
          </button>
        ))}
      </div>
    </div>
  )
}
