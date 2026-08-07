import { BarChart3, LineChart, TrendingUp } from 'lucide-react'
import {
  formatSeasonRecordSummary,
  type SeasonRecord,
  type SeasonReportData,
} from '@/lib/season-reporting'

type SeasonDetailsTabProps = {
  activeTeamName: string
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

function recordWinRate(record: SeasonRecord): string {
  if (record.matchesPlayed === 0) return '—'
  const pct = Math.round((record.wins / record.matchesPlayed) * 100)
  return `${pct}%`
}

function recordGoalDiff(record: SeasonRecord): string {
  const diff = record.goalsFor - record.goalsAgainst
  return diff > 0 ? `+${diff}` : String(diff)
}

export function SeasonDetailsTab({ activeTeamName, data }: SeasonDetailsTabProps) {
  const { seasonRecord, matches } = data

  return (
    <div className="space-y-4">
      <div>
        <h2 className="flex items-center gap-2 font-display text-base font-bold uppercase tracking-wide text-foreground">
          <BarChart3 className="size-5 text-athletic" />
          Season Overview
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          High-level analytics for {activeTeamName || 'your team'}. Deeper trend charts coming soon.
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
            <StatCard label="Win Rate" value={recordWinRate(seasonRecord)} />
            <StatCard label="Goal Diff" value={recordGoalDiff(seasonRecord)} />
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
        </>
      )}

      <section className="space-y-3 rounded-xl border border-dashed border-border bg-card/40 p-4">
        <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">
          <TrendingUp className="size-4" />
          Analytics Framework
        </h3>
        <p className="text-sm text-muted-foreground">
          This section will expand with playing-time trends, formation usage, scoring timelines, and
          roster depth charts as aggregation logic is added.
        </p>

        <ul className="space-y-2">
          {[
            {
              icon: LineChart,
              title: 'Playing Time Trends',
              description: 'Minutes distribution and bench rotation patterns across the season.',
            },
            {
              icon: BarChart3,
              title: 'Scoring & Defense',
              description: 'Goals for/against by month, venue, and opponent strength.',
            },
            {
              icon: TrendingUp,
              title: 'Player Development',
              description: 'Rating trajectory and position versatility over time.',
            },
          ].map(({ icon: Icon, title, description }) => (
            <li
              key={title}
              className="flex items-start gap-3 rounded-lg border border-border bg-card p-3 opacity-80"
            >
              <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <div>
                <p className="text-sm font-bold text-foreground">{title}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
              </div>
            </li>
          ))}
        </ul>

        <p className="text-xs text-muted-foreground">
          {matches.length} completed match{matches.length === 1 ? '' : 'es'} loaded for aggregation.
        </p>
      </section>
    </div>
  )
}
