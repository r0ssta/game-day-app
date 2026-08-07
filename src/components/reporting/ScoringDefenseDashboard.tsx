import { useMemo, useState } from 'react'
import { BarChart3 } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  type ScoringDefenseAnalytics,
  type ScoringTrendPoint,
  type VenueRecord,
} from '@/lib/season-analytics'
import { AnalyticsModule, ProgressBar } from '@/components/reporting/AnalyticsModule'

type ScoringDefenseDashboardProps = {
  analytics: ScoringDefenseAnalytics
}

type VenueFilter = 'all' | 'home' | 'away'

function VenueToggle({
  value,
  onChange,
}: {
  value: VenueFilter
  onChange: (next: VenueFilter) => void
}) {
  const options: Array<{ id: VenueFilter; label: string }> = [
    { id: 'all', label: 'All' },
    { id: 'home', label: 'Home' },
    { id: 'away', label: 'Away' },
  ]

  return (
    <div className="inline-flex rounded-lg border border-border bg-secondary/30 p-1">
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          onClick={() => onChange(option.id)}
          className={cn(
            'rounded-md px-3 py-1 text-xs font-bold uppercase tracking-wide transition-colors',
            value === option.id
              ? 'bg-athletic text-athletic-foreground'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

function VenueCard({ record }: { record: VenueRecord }) {
  const recordLabel = `${record.wins}-${record.losses}-${record.draws}`
  return (
    <div className="rounded-lg border border-border bg-secondary/30 p-3">
      <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
        {record.venue === 'home' ? 'Home' : 'Away'}
      </p>
      <p className="mt-1 font-display text-lg font-black tabular-nums text-foreground">
        {recordLabel}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        {record.goalsFor} GF · {record.goalsAgainst} GA ·{' '}
        {record.goalDifferential > 0 ? '+' : ''}
        {record.goalDifferential} diff
      </p>
      <p className="mt-0.5 text-xs font-semibold text-muted-foreground">
        {record.avgGoalsFor} GF / {record.avgGoalsAgainst} GA per match
      </p>
      <p className="mt-0.5 text-[10px] text-muted-foreground">
        {record.matchesPlayed} match{record.matchesPlayed === 1 ? '' : 'es'}
      </p>
    </div>
  )
}

function TrendRow({ point, maxGoals }: { point: ScoringTrendPoint; maxGoals: number }) {
  return (
    <li className="space-y-2 rounded-lg border border-border bg-secondary/20 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-bold text-foreground">{point.monthLabel}</span>
        <span className="text-xs font-semibold text-muted-foreground">
          {point.matchesPlayed} match{point.matchesPlayed === 1 ? '' : 'es'}
        </span>
      </div>
      <div className="space-y-1.5">
        <div>
          <div className="mb-1 flex justify-between text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
            <span>Goals For</span>
            <span className="tabular-nums text-neon">{point.goalsFor}</span>
          </div>
          <ProgressBar value={point.goalsFor} max={maxGoals} />
        </div>
        <div>
          <div className="mb-1 flex justify-between text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
            <span>Goals Against</span>
            <span className="tabular-nums text-danger">{point.goalsAgainst}</span>
          </div>
          <ProgressBar value={point.goalsAgainst} max={maxGoals} tone="danger" />
        </div>
      </div>
      <p
        className={cn(
          'text-xs font-semibold',
          point.goalDifferential > 0
            ? 'text-neon'
            : point.goalDifferential < 0
              ? 'text-danger'
              : 'text-muted-foreground',
        )}
      >
        Goal diff: {point.goalDifferential > 0 ? '+' : ''}
        {point.goalDifferential}
      </p>
    </li>
  )
}

export function ScoringDefenseDashboard({ analytics }: ScoringDefenseDashboardProps) {
  const [venueFilter, setVenueFilter] = useState<VenueFilter>('all')

  const home = analytics.byVenue.find((record) => record.venue === 'home')
  const away = analytics.byVenue.find((record) => record.venue === 'away')

  const activeVenue = useMemo(() => {
    if (venueFilter === 'home') return home ?? null
    if (venueFilter === 'away') return away ?? null
    return null
  }, [venueFilter, home, away])

  const displayRecord = useMemo(() => {
    if (activeVenue) return activeVenue
    return {
      venue: 'all' as const,
      wins: analytics.overall.wins,
      losses: analytics.overall.losses,
      draws: analytics.overall.draws,
      goalsFor: analytics.overall.goalsFor,
      goalsAgainst: analytics.overall.goalsAgainst,
      matchesPlayed: analytics.overall.matchesPlayed,
      goalDifferential: analytics.overall.goalsFor - analytics.overall.goalsAgainst,
      avgGoalsFor:
        analytics.overall.matchesPlayed > 0
          ? Math.round((analytics.overall.goalsFor / analytics.overall.matchesPlayed) * 10) / 10
          : 0,
      avgGoalsAgainst:
        analytics.overall.matchesPlayed > 0
          ? Math.round((analytics.overall.goalsAgainst / analytics.overall.matchesPlayed) * 10) / 10
          : 0,
    }
  }, [activeVenue, analytics.overall])

  const cleanSheetsForFilter =
    venueFilter === 'home'
      ? analytics.cleanSheets.home
      : venueFilter === 'away'
        ? analytics.cleanSheets.away
        : analytics.cleanSheets.total

  const cleanSheetRateForFilter =
    displayRecord.matchesPlayed > 0
      ? Math.round((cleanSheetsForFilter / displayRecord.matchesPlayed) * 100)
      : 0

  const maxTrendGoals = Math.max(
    1,
    ...analytics.monthlyTrend.flatMap((point) => [point.goalsFor, point.goalsAgainst]),
  )

  const summary = `${displayRecord.goalsFor} GF · ${displayRecord.goalsAgainst} GA · ${
    displayRecord.goalDifferential > 0 ? '+' : ''
  }${displayRecord.goalDifferential} diff · ${cleanSheetsForFilter} clean sheet${
    cleanSheetsForFilter === 1 ? '' : 's'
  }`

  return (
    <AnalyticsModule
      title="Scoring & Defense"
      description="Goals for/against, clean sheets, and venue splits across the season."
      icon={BarChart3}
      summary={summary}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <VenueToggle value={venueFilter} onChange={setVenueFilter} />
        <p className="text-xs font-semibold text-muted-foreground">
          {displayRecord.matchesPlayed} match{displayRecord.matchesPlayed === 1 ? '' : 'es'} ·{' '}
          {displayRecord.wins}-{displayRecord.losses}-{displayRecord.draws}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <div className="rounded-lg border border-border bg-secondary/30 p-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Goals For
          </p>
          <p className="mt-1 font-display text-xl font-black tabular-nums text-neon">
            {displayRecord.goalsFor}
          </p>
        </div>
        <div className="rounded-lg border border-border bg-secondary/30 p-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Goals Against
          </p>
          <p className="mt-1 font-display text-xl font-black tabular-nums text-danger">
            {displayRecord.goalsAgainst}
          </p>
        </div>
        <div className="rounded-lg border border-border bg-secondary/30 p-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Goal Diff
          </p>
          <p className="mt-1 font-display text-xl font-black tabular-nums text-foreground">
            {displayRecord.goalDifferential > 0 ? '+' : ''}
            {displayRecord.goalDifferential}
          </p>
        </div>
        <div className="rounded-lg border border-border bg-secondary/30 p-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Clean Sheets
          </p>
          <p className="mt-1 font-display text-xl font-black tabular-nums text-neon">
            {cleanSheetsForFilter}
          </p>
          <p className="mt-0.5 text-[10px] text-muted-foreground">{cleanSheetRateForFilter}% rate</p>
        </div>
        <div className="rounded-lg border border-border bg-secondary/30 p-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Avg GF / GA
          </p>
          <p className="mt-1 font-display text-lg font-black tabular-nums text-foreground">
            {displayRecord.matchesPlayed > 0
              ? `${displayRecord.avgGoalsFor} / ${displayRecord.avgGoalsAgainst}`
              : '—'}
          </p>
        </div>
      </div>

      {venueFilter === 'all' ? (
        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
            Home vs Away
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {home && home.matchesPlayed > 0 ? <VenueCard record={home} /> : null}
            {away && away.matchesPlayed > 0 ? <VenueCard record={away} /> : null}
            {!home?.matchesPlayed && !away?.matchesPlayed ? (
              <p className="text-sm italic text-muted-foreground">No venue data yet.</p>
            ) : null}
          </div>
        </div>
      ) : activeVenue && activeVenue.matchesPlayed > 0 ? (
        <VenueCard record={activeVenue} />
      ) : (
        <p className="text-sm italic text-muted-foreground">
          No {venueFilter} matches loaded for this filter.
        </p>
      )}

      <div>
        <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
          Scoring Trend by Month
        </p>
        {analytics.monthlyTrend.length > 0 ? (
          <ul className="space-y-2">
            {analytics.monthlyTrend.map((point) => (
              <TrendRow key={point.monthKey} point={point} maxGoals={maxTrendGoals} />
            ))}
          </ul>
        ) : (
          <p className="text-sm italic text-muted-foreground">No chronological scoring data yet.</p>
        )}
      </div>
    </AnalyticsModule>
  )
}
