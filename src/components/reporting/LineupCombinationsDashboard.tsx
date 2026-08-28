import { Users } from 'lucide-react'
import { formatPlusMinus } from '@/lib/plus-minus'
import type { LineupCombinationAnalytics } from '@/lib/lineup-analytics'
import { AnalyticsModule, ProgressBar } from '@/components/reporting/AnalyticsModule'
import { cn } from '@/lib/utils'

type LineupCombinationsDashboardProps = {
  analytics: LineupCombinationAnalytics
}

function formatJersey(number: number | null) {
  return number !== null ? String(number) : '—'
}

function formatGoalDiff(diff: number): string {
  return diff > 0 ? `+${diff}` : String(diff)
}

export function LineupCombinationsDashboard({ analytics }: LineupCombinationsDashboardProps) {
  const topPair = analytics.topPairs[0]
  const topFormation = analytics.topFormations[0]
  const summary =
    topPair && topFormation
      ? `Best pair: ${topPair.nameA} & ${topPair.nameB} (${formatGoalDiff(topPair.goalDifferential)}) · ${topFormation.label} (${formatGoalDiff(topFormation.goalDifferential)})`
      : topPair
        ? `Best pair: ${topPair.nameA} & ${topPair.nameB} (${formatGoalDiff(topPair.goalDifferential)})`
        : undefined

  const maxPairDiff = Math.max(
    1,
    ...analytics.topPairs.map((pair) => Math.abs(pair.goalDifferential)),
  )
  const maxFormationDiff = Math.max(
    1,
    ...analytics.topFormations.map((formation) => Math.abs(formation.goalDifferential)),
  )
  const maxPositionPlusMinus = Math.max(
    1,
    ...analytics.positionEfficiency.map((entry) => Math.abs(entry.plusMinus)),
  )

  return (
    <AnalyticsModule
      title="Best Combinations"
      description="Pairings, formations, and positions with the strongest on-field goal differentials."
      icon={Users}
      summary={summary}
    >
      <div>
        <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
          Top Player Pairings
        </p>
        {analytics.topPairs.length > 0 ? (
          <ul className="space-y-3">
            {analytics.topPairs.map((pair) => (
              <li key={`${pair.playerAId}::${pair.playerBId}`} className="space-y-1.5">
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="min-w-0 truncate font-semibold text-foreground">
                    #{formatJersey(pair.jerseyA)} {pair.nameA} & #{formatJersey(pair.jerseyB)}{' '}
                    {pair.nameB}
                  </span>
                  <span
                    className={cn(
                      'shrink-0 font-mono text-xs font-bold tabular-nums',
                      pair.goalDifferential > 0
                        ? 'text-neon'
                        : pair.goalDifferential < 0
                          ? 'text-danger'
                          : 'text-muted-foreground',
                    )}
                  >
                    {formatGoalDiff(pair.goalDifferential)}
                  </span>
                </div>
                <ProgressBar
                  value={Math.abs(pair.goalDifferential)}
                  max={maxPairDiff}
                  tone={pair.goalDifferential < 0 ? 'danger' : 'neon'}
                />
                <p className="text-[10px] text-muted-foreground">
                  {pair.goalsFor} GF · {pair.goalsAgainst} GA · {pair.goalEventsTogether} goal
                  events together
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm italic text-muted-foreground">
            Log goals with substitutions to surface high-impact pairings.
          </p>
        )}
      </div>

      <div>
        <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
          Formation Efficiency
        </p>
        {analytics.topFormations.length > 0 ? (
          <ul className="space-y-3">
            {analytics.topFormations.map((formation) => (
              <li key={formation.formationId} className="space-y-1.5">
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="font-semibold text-foreground">{formation.label}</span>
                  <span
                    className={cn(
                      'shrink-0 font-mono text-xs font-bold tabular-nums',
                      formation.goalDifferential > 0
                        ? 'text-neon'
                        : formation.goalDifferential < 0
                          ? 'text-danger'
                          : 'text-muted-foreground',
                    )}
                  >
                    {formatGoalDiff(formation.goalDifferential)}
                  </span>
                </div>
                <ProgressBar
                  value={Math.abs(formation.goalDifferential)}
                  max={maxFormationDiff}
                  tone={formation.goalDifferential < 0 ? 'danger' : 'neon'}
                />
                <p className="text-[10px] text-muted-foreground">
                  {formation.goalsFor} GF · {formation.goalsAgainst} GA · {formation.goalEvents}{' '}
                  events
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm italic text-muted-foreground">
            Formation tags on goal events unlock tactical efficiency trends.
          </p>
        )}
      </div>

      <div>
        <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
          Positional Efficiency
        </p>
        {analytics.positionEfficiency.length > 0 ? (
          <ul className="space-y-3">
            {analytics.positionEfficiency.map((entry) => (
              <li key={entry.position} className="space-y-1.5">
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="font-semibold text-foreground">{entry.position}</span>
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
                <ProgressBar
                  value={Math.abs(entry.plusMinus)}
                  max={maxPositionPlusMinus}
                  tone={entry.plusMinus < 0 ? 'danger' : 'neon'}
                />
                <p className="text-[10px] text-muted-foreground">
                  {entry.players} players · {entry.positivePercent}% rated 4–5 · {entry.goals}{' '}
                  G · {entry.assists} A
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm italic text-muted-foreground">
            Position usage and reviews populate role efficiency once matches are completed.
          </p>
        )}
      </div>
    </AnalyticsModule>
  )
}
