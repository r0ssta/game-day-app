import { Activity } from 'lucide-react'
import { formatPlusMinus } from '@/lib/plus-minus'
import type { PlusMinusAnalytics } from '@/lib/season-analytics'
import { AnalyticsModule, ProgressBar } from '@/components/reporting/AnalyticsModule'
import { cn } from '@/lib/utils'

function formatJersey(number: number | null) {
  return number !== null ? String(number) : '—'
}

type PlusMinusDashboardProps = {
  analytics: PlusMinusAnalytics
}

export function PlusMinusDashboard({ analytics }: PlusMinusDashboardProps) {
  const maxAbs = Math.max(1, ...analytics.leaders.map((entry) => Math.abs(entry.plusMinus)))
  const summary = analytics.topImpact
    ? `Impact leader: ${analytics.topImpact.name} (${formatPlusMinus(analytics.topImpact.plusMinus)})`
    : undefined

  return (
    <AnalyticsModule
      title="Plus/Minus Impact Lineup"
      description="On-field goal differential while each player was active (+1 for GF, −1 for GA)."
      icon={Activity}
      summary={summary}
    >
      <div className="rounded-lg border border-border bg-secondary/30 p-3">
        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
          Team Cumulative +/−
        </p>
        <p
          className={cn(
            'mt-1 font-display text-xl font-black tabular-nums',
            analytics.teamPlusMinus > 0
              ? 'text-neon'
              : analytics.teamPlusMinus < 0
                ? 'text-danger'
                : 'text-foreground',
          )}
        >
          {formatPlusMinus(analytics.teamPlusMinus)}
        </p>
      </div>

      {analytics.leaders.length > 0 ? (
        <ul className="space-y-3">
          {analytics.leaders.map((entry, index) => (
            <li key={entry.playerId} className="space-y-1.5">
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="min-w-0 truncate font-semibold text-foreground">
                  <span className="mr-2 font-display tabular-nums text-muted-foreground">
                    {index + 1}.
                  </span>
                  #{formatJersey(entry.jersey)} {entry.name}
                </span>
                <span
                  className={cn(
                    'shrink-0 font-mono text-xs font-bold tabular-nums',
                    entry.plusMinus > 0
                      ? 'text-neon'
                      : entry.plusMinus < 0
                        ? 'text-danger'
                        : 'text-muted-foreground',
                  )}
                >
                  {formatPlusMinus(entry.plusMinus)}
                </span>
              </div>
              <ProgressBar value={Math.abs(entry.plusMinus)} max={maxAbs} tone={entry.plusMinus < 0 ? 'danger' : 'neon'} />
              <p className="text-[10px] text-muted-foreground">
                {entry.matchesPlayed} matches · {entry.goals} G · {entry.assists} A
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm italic text-muted-foreground">
          Complete matches with logged goals and substitutions to populate plus/minus.
        </p>
      )}
    </AnalyticsModule>
  )
}
