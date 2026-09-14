import {
  formatPlayingTimeBarLabel,
  playingTimeBarPercents,
  type PlayingTimeLabelVariant,
} from '@/lib/playing-time-bar'
import { cn } from '@/lib/utils'

export type PlayingTimeBarProps = {
  fieldSeconds: number
  gkSeconds: number
  maxSeconds: number
  className?: string
  labelClassName?: string
  /** Recap views use verbose so GK minutes are labeled, not only a glove emoji. */
  variant?: PlayingTimeLabelVariant
}

export function PlayingTimeLegend({ className }: { className?: string }) {
  return (
    <p className={cn('text-xs font-semibold text-muted-foreground', className)}>
      Minutes · <span className="text-neon">field</span>
      {' · '}
      <span className="text-amber-400">GK</span>
    </p>
  )
}

export function PlayingTimeBar({
  fieldSeconds,
  gkSeconds,
  maxSeconds,
  className,
  labelClassName,
  variant = 'compact',
}: PlayingTimeBarProps) {
  const { fieldPct, gkPct } = playingTimeBarPercents(fieldSeconds, gkSeconds, maxSeconds)
  const label = formatPlayingTimeBarLabel(fieldSeconds, gkSeconds, variant)

  return (
    <div className={cn(variant === 'verbose' ? 'min-w-[8rem]' : 'min-w-[5.5rem]', className)}>
      <p
        className={cn(
          'mb-1 text-[11px] font-bold tabular-nums leading-none text-foreground',
          labelClassName,
        )}
      >
        {label}
      </p>
      <div
        className="flex h-1.5 w-full overflow-hidden rounded-full bg-secondary"
        role="img"
        aria-label={label}
      >
        {fieldPct > 0 ? (
          <div className="h-full shrink-0 bg-neon" style={{ width: `${fieldPct}%` }} />
        ) : null}
        {gkPct > 0 ? (
          <div className="h-full shrink-0 bg-amber-400" style={{ width: `${gkPct}%` }} />
        ) : null}
      </div>
    </div>
  )
}
