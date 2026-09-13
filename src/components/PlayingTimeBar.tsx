import {
  formatPlayingTimeBarLabel,
  playingTimeBarPercents,
} from '@/lib/playing-time-bar'
import { cn } from '@/lib/utils'

export type PlayingTimeBarProps = {
  fieldSeconds: number
  gkSeconds: number
  maxSeconds: number
  className?: string
}

export function PlayingTimeBar({
  fieldSeconds,
  gkSeconds,
  maxSeconds,
  className,
}: PlayingTimeBarProps) {
  const { fieldPct, gkPct } = playingTimeBarPercents(fieldSeconds, gkSeconds, maxSeconds)
  const label = formatPlayingTimeBarLabel(fieldSeconds, gkSeconds)

  return (
    <div className={cn('min-w-[5.5rem]', className)}>
      <p className="mb-1 text-[11px] font-bold tabular-nums leading-none text-foreground">{label}</p>
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
