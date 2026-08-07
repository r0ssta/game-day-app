import { useState } from 'react'
import { formatMinutesLabel, type PlayingTimeAnalytics } from '@/lib/season-analytics'
import { AnalyticsModule, ProgressBar } from '@/components/reporting/AnalyticsModule'
import { cn } from '@/lib/utils'
import { LineChart } from 'lucide-react'

function formatJersey(number: number | null) {
  return number !== null ? String(number) : '—'
}

type PlayingTimeDashboardProps = {
  analytics: PlayingTimeAnalytics
}

export function PlayingTimeDashboard({ analytics }: PlayingTimeDashboardProps) {
  const [metric, setMetric] = useState<'total' | 'average'>('total')
  const maxValue =
    metric === 'total'
      ? analytics.leaders[0]?.totalMinutes ?? 0
      : analytics.leaders[0]?.averageMinutesPerMatch ?? 0

  const summary = analytics.ironMan
    ? `Iron Man: ${analytics.ironMan.name} · ${formatMinutesLabel(analytics.ironMan.totalMinutes)}`
    : undefined

  return (
    <AnalyticsModule
      title="Playing Time Trends"
      description="Minutes distribution and bench rotation patterns across the season."
      icon={LineChart}
      defaultOpen
      summary={summary}
    >
      <div className="flex flex-wrap gap-2">
        {(['total', 'average'] as const).map((mode) => (
          <button
            key={mode}
            type="button"
            onClick={() => setMetric(mode)}
            className={cn(
              'rounded-lg px-3 py-1.5 text-xs font-bold uppercase tracking-wide',
              metric === mode
                ? 'bg-neon text-neon-foreground'
                : 'bg-secondary text-muted-foreground',
            )}
          >
            {mode === 'total' ? 'Total Minutes' : 'Avg / Match'}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg border border-border bg-secondary/30 p-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Team Minutes
          </p>
          <p className="mt-1 font-display text-xl font-black tabular-nums text-foreground">
            {formatMinutesLabel(analytics.teamTotalMinutes)}
          </p>
        </div>
        <div className="rounded-lg border border-border bg-secondary/30 p-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Team Avg / Match
          </p>
          <p className="mt-1 font-display text-xl font-black tabular-nums text-foreground">
            {formatMinutesLabel(analytics.teamAverageMinutesPerMatch)}
          </p>
        </div>
      </div>

      {analytics.ironMan ? (
        <div className="rounded-lg border border-neon/30 bg-neon/5 p-3">
          <p className="text-xs font-bold uppercase tracking-wide text-neon">Iron Man</p>
          <p className="mt-1 text-sm font-bold text-foreground">
            #{formatJersey(analytics.ironMan.jersey)} {analytics.ironMan.name}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {formatMinutesLabel(analytics.ironMan.totalMinutes)} total ·{' '}
            {formatMinutesLabel(analytics.ironMan.averageMinutesPerMatch)} avg ·{' '}
            {analytics.ironMan.minutesSharePercent}% of team minutes
          </p>
        </div>
      ) : null}

      {analytics.leaders.length > 0 ? (
        <ul className="space-y-3">
          {analytics.leaders.map((entry, index) => {
            const value = metric === 'total' ? entry.totalMinutes : entry.averageMinutesPerMatch
            const valueLabel =
              metric === 'total'
                ? formatMinutesLabel(entry.totalMinutes)
                : `${formatMinutesLabel(entry.averageMinutesPerMatch)} avg`

            return (
              <li key={entry.playerId} className="space-y-1.5">
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="min-w-0 truncate font-semibold text-foreground">
                    <span className="mr-2 font-display tabular-nums text-muted-foreground">
                      {index + 1}.
                    </span>
                    #{formatJersey(entry.jersey)} {entry.name}
                  </span>
                  <span className="shrink-0 font-mono text-xs font-bold tabular-nums text-blue-400">
                    {valueLabel}
                  </span>
                </div>
                <ProgressBar value={value} max={maxValue} />
                <p className="text-[10px] text-muted-foreground">
                  {entry.matchesPlayed} matches · {entry.minutesSharePercent}% of team minutes
                  {entry.averageMinutesPerMatch < analytics.teamAverageMinutesPerMatch
                    ? ' · rotation tier'
                    : ''}
                </p>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="text-sm italic text-muted-foreground">No playing time data yet.</p>
      )}

      {analytics.rotationPlayers.length > 0 ? (
        <div className="rounded-lg border border-border bg-secondary/20 p-3">
          <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
            Rotation Pattern
          </p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            {analytics.rotationPlayers.length} player
            {analytics.rotationPlayers.length === 1 ? '' : 's'} below the team average of{' '}
            {formatMinutesLabel(analytics.teamAverageMinutesPerMatch)} per match.
          </p>
        </div>
      ) : null}
    </AnalyticsModule>
  )
}
