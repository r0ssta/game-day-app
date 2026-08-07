import { TrendingUp } from 'lucide-react'
import { formatImpactSymbol, type PlayerDevelopmentAnalytics } from '@/lib/season-analytics'
import { AnalyticsModule } from '@/components/reporting/AnalyticsModule'
import { cn } from '@/lib/utils'

function formatJersey(number: number | null) {
  return number !== null ? String(number) : '—'
}

const IMPACT_BADGE: Record<'positive' | 'neutral' | 'negative', string> = {
  positive: 'bg-neon/15 text-neon',
  neutral: 'bg-secondary text-muted-foreground',
  negative: 'bg-danger/15 text-danger',
}

type PlayerDevelopmentDashboardProps = {
  analytics: PlayerDevelopmentAnalytics
}

export function PlayerDevelopmentDashboard({ analytics }: PlayerDevelopmentDashboardProps) {
  const summary = `${analytics.teamPositivePercent}% team positive · ${analytics.players.length} rated players`

  return (
    <AnalyticsModule
      title="Player Development"
      description="Overall rating trajectory and position versatility across the season."
      icon={TrendingUp}
      summary={summary}
    >
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg border border-border bg-secondary/30 p-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Team Positive Rate
          </p>
          <p className="mt-1 font-display text-xl font-black tabular-nums text-neon">
            {analytics.teamPositivePercent}%
          </p>
        </div>
        <div className="rounded-lg border border-border bg-secondary/30 p-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Ratings Logged
          </p>
          <p className="mt-1 font-display text-xl font-black tabular-nums text-foreground">
            {analytics.ratedMatchCount}
          </p>
        </div>
      </div>

      {analytics.players.length > 0 ? (
        <ul className="space-y-3">
          {analytics.players.map((entry) => (
            <li key={entry.playerId} className="rounded-lg border border-border bg-secondary/20 p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-bold text-foreground">
                    #{formatJersey(entry.jersey)} {entry.name}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {entry.matchesPlayed} matches · {entry.overallPositivePercent}% positive overall
                    · versatility {entry.versatilityScore}
                  </p>
                </div>
                <span
                  className={cn(
                    'rounded px-2 py-0.5 text-xs font-bold',
                    IMPACT_BADGE[entry.averageOverallRating],
                  )}
                >
                  Avg {formatImpactSymbol(entry.averageOverallRating)}
                </span>
              </div>

              {entry.uniquePositions.length > 0 ? (
                <p className="mt-2 text-xs font-semibold text-foreground">
                  Positions: {entry.uniquePositions.join(', ')}
                </p>
              ) : null}

              {entry.roleSummaries.length > 0 ? (
                <ul className="mt-2 space-y-1">
                  {entry.roleSummaries.map((role) => (
                    <li key={role.position} className="text-xs text-muted-foreground">
                      <span className="font-semibold text-foreground">{role.position}</span>
                      {' · '}
                      {role.positivePercent}% positive across {role.matchCount} rated match
                      {role.matchCount === 1 ? '' : 'es'}
                    </li>
                  ))}
                </ul>
              ) : null}

              {entry.ratingTrajectory.length > 0 ? (
                <div className="mt-3">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                    Rating Trajectory
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {entry.ratingTrajectory.map((point) => (
                      <span
                        key={point.matchId}
                        title={`${point.dateLabel} vs ${point.opponent}`}
                        className={cn(
                          'rounded px-1.5 py-0.5 text-[10px] font-bold',
                          IMPACT_BADGE[point.impact],
                        )}
                      >
                        {formatImpactSymbol(point.impact)}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm italic text-muted-foreground">
          Complete post-game reviews to populate player development metrics.
        </p>
      )}
    </AnalyticsModule>
  )
}
