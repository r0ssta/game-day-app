import { useMatchClockSelector } from '@/lib/match-clock-store'
import { formatPlayingTimeClock, getLiveSecondsPlayed } from '@/lib/play-time'
import { cn } from '@/lib/utils'
import type { MatchPlayer } from '@/types/match'

type LivePlayingTimeLabelProps = {
  player: MatchPlayer
  /** Passed through as the open-stint fallback, matching the live pitch. */
  periodStartRemaining?: number
  emphasize?: boolean
  className?: string
}

/** Subscribes to the match clock so a minutes label can tick without rendering the pitch. */
export function LivePlayingTimeLabel({
  player,
  periodStartRemaining,
  emphasize = false,
  className,
}: LivePlayingTimeLabelProps) {
  const label = useMatchClockSelector((seconds) =>
    formatPlayingTimeClock(getLiveSecondsPlayed(player, seconds, periodStartRemaining)),
  )

  return (
    <span
      className={cn(
        'font-display font-black tabular-nums leading-none',
        emphasize && 'text-amber-950',
        className,
      )}
      title={emphasize ? `${label} played — consider a sub` : `${label} played`}
      aria-label={emphasize ? `${label} played — consider a sub` : `${label} played`}
    >
      {label}
    </span>
  )
}
