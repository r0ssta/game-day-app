import { useMemo } from 'react'
import { BarChart3 } from 'lucide-react'
import { LineupCombinationsDashboard } from '@/components/reporting/LineupCombinationsDashboard'
import { PlusMinusDashboard } from '@/components/reporting/PlusMinusDashboard'
import { PlayerDevelopmentDashboard } from '@/components/reporting/PlayerDevelopmentDashboard'
import { PlayingTimeDashboard } from '@/components/reporting/PlayingTimeDashboard'
import { ScoringDefenseDashboard } from '@/components/reporting/ScoringDefenseDashboard'
import { buildSeasonAnalytics } from '@/lib/season-analytics'
import {
  formatSeasonRecordSummary,
  type SeasonReportData,
} from '@/lib/season-reporting'
import type { RosterPlayer } from '@/types/match'

type SeasonDetailsTabProps = {
  activeTeamName: string
  roster: RosterPlayer[]
  data: SeasonReportData
}

function StatCard({
  label,
  value,
  hint,
}: {
  label: string
  value: string
  hint?: string
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className="mt-1 font-display text-2xl font-black tabular-nums text-foreground">{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  )
}

function recordWinRate(matchesPlayed: number, wins: number): string {
  if (matchesPlayed === 0) return '—'
  const pct = Math.round((wins / matchesPlayed) * 100)
  return `${pct}%`
}

function recordGoalDiff(goalsFor: number, goalsAgainst: number): string {
  const diff = goalsFor - goalsAgainst
  return diff > 0 ? `+${diff}` : String(diff)
}

export function SeasonDetailsTab({ activeTeamName, roster, data }: SeasonDetailsTabProps) {
  const { seasonRecord } = data
  const analytics = useMemo(() => buildSeasonAnalytics(data, roster), [data, roster])

  return (
    <div className="space-y-4">
      <div>
        <h2 className="flex items-center gap-2 font-display text-base font-bold uppercase tracking-wide text-foreground">
          <BarChart3 className="size-5 text-athletic" />
          Season Overview
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Analytics for {activeTeamName || 'your team'} from completed matches and post-game reviews.
        </p>
      </div>

      {seasonRecord.matchesPlayed === 0 ? (
        <p className="rounded-xl border border-border bg-card px-4 py-8 text-center text-sm text-muted-foreground">
          Complete at least one match to populate season analytics.
        </p>
      ) : (
        <>
          <section className="rounded-xl border border-neon/30 bg-neon/5 p-4">
            <p className="text-sm font-semibold leading-relaxed text-foreground">
              {formatSeasonRecordSummary(seasonRecord)}
            </p>
          </section>

          <div className="grid grid-cols-2 gap-3">
            <StatCard
              label="Win Rate"
              value={recordWinRate(seasonRecord.matchesPlayed, seasonRecord.wins)}
            />
            <StatCard
              label="Goal Diff"
              value={recordGoalDiff(seasonRecord.goalsFor, seasonRecord.goalsAgainst)}
            />
            <StatCard
              label="Matches"
              value={String(seasonRecord.matchesPlayed)}
              hint="Completed this season"
            />
            <StatCard
              label="Avg GF / GA"
              value={`${(seasonRecord.goalsFor / seasonRecord.matchesPlayed).toFixed(1)} / ${(seasonRecord.goalsAgainst / seasonRecord.matchesPlayed).toFixed(1)}`}
              hint="Per match"
            />
          </div>

          <section className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
              Analytics Dashboards
            </h3>
            <PlayingTimeDashboard analytics={analytics.playingTime} />
            <PlusMinusDashboard analytics={analytics.plusMinus} />
            <ScoringDefenseDashboard analytics={analytics.scoringDefense} />
            <LineupCombinationsDashboard analytics={analytics.lineupCombinations} />
            <PlayerDevelopmentDashboard analytics={analytics.playerDevelopment} />
          </section>
        </>
      )}

      <p className="text-center text-xs text-muted-foreground">
        {analytics.completedMatchCount} completed match
        {analytics.completedMatchCount === 1 ? '' : 'es'} loaded for aggregation.
      </p>
    </div>
  )
}
