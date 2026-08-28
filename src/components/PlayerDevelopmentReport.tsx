import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, CalendarRange, Shirt, UserRound } from 'lucide-react'
import { formatRecapMinutes } from '@/lib/match-recap'
import { formatPlayerFullName } from '@/lib/player-names'
import { formatPlusMinus } from '@/lib/plus-minus'
import {
  filterGuestAppearances,
  filterRosterHistory,
  loadPlayerDevelopmentReport,
  selectDevelopmentTotals,
  type PlayerDevelopmentReport,
  type PlayerDevelopmentTimeframe,
  type PlayerDevelopmentTotals,
} from '@/lib/player-development-report'
import { TOUCH_ICON_BUTTON } from '@/lib/layout'
import type { DbSeason, DbTeam } from '@/types/database'
import { cn } from '@/lib/utils'

type PlayerDevelopmentReportViewProps = {
  playerId: string
  teams: DbTeam[]
  activeSeason: DbSeason | null
  onBack: () => void
  onToast: (message: string) => void
}

function MetricCard({
  label,
  value,
  emphasize,
}: {
  label: string
  value: string
  emphasize?: boolean
}) {
  return (
    <div className="rounded-xl border-2 border-border bg-background px-3 py-3">
      <p className="text-[11px] font-extrabold uppercase tracking-widest text-muted-foreground">
        {label}
      </p>
      <p
        className={cn(
          'mt-1 font-display text-2xl font-black tabular-nums text-foreground',
          emphasize && 'text-neon',
        )}
      >
        {value}
      </p>
    </div>
  )
}

function TotalsGrid({ totals }: { totals: PlayerDevelopmentTotals }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      <MetricCard label="Matches" value={String(totals.matchesPlayed)} />
      <MetricCard label="Minutes" value={formatRecapMinutes(totals.totalSeconds)} />
      <MetricCard label="Goals" value={String(totals.goals)} emphasize />
      <MetricCard label="Assists" value={String(totals.assists)} />
      <MetricCard label="Yellow Cards" value={String(totals.yellowCards)} />
      <MetricCard label="Red Cards" value={String(totals.redCards)} />
      <MetricCard label="Tackles" value={String(totals.tackles)} />
      <MetricCard label="Key Passes" value={String(totals.keyPasses)} />
      <MetricCard
        label="Plus / Minus"
        value={formatPlusMinus(totals.plusMinus)}
        emphasize
      />
    </div>
  )
}

export function PlayerDevelopmentReportView({
  playerId,
  teams,
  activeSeason,
  onBack,
  onToast,
}: PlayerDevelopmentReportViewProps) {
  const [report, setReport] = useState<PlayerDevelopmentReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [timeframe, setTimeframe] = useState<PlayerDevelopmentTimeframe>(
    activeSeason ? 'season' : 'career',
  )

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    void loadPlayerDevelopmentReport({ playerId, activeSeason, teams })
      .then((data) => {
        if (!cancelled) setReport(data)
      })
      .catch((err) => {
        if (!cancelled) {
          onToast(err instanceof Error ? err.message : 'Failed to load report')
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [playerId, activeSeason, teams, onToast])

  const totals = useMemo(
    () => (report ? selectDevelopmentTotals(report, timeframe) : null),
    [report, timeframe],
  )
  const rosterHistory = useMemo(
    () => (report ? filterRosterHistory(report, timeframe) : []),
    [report, timeframe],
  )
  const guestAppearances = useMemo(
    () => (report ? filterGuestAppearances(report, timeframe) : []),
    [report, timeframe],
  )

  const seasonLabel = activeSeason?.name?.trim() || 'Active Season'

  return (
    <section className="player-development-report mt-6 space-y-4 rounded-2xl border-2 border-border bg-card p-4">
      <header className="flex items-start gap-3">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to player directory"
          className={`${TOUCH_ICON_BUTTON} mt-0.5 border-2 border-border bg-background`}
        >
          <ArrowLeft className="size-5" strokeWidth={2.5} />
        </button>
        <div className="min-w-0 flex-1">
          {loading || !report ? (
            <>
              <h2 className="font-display text-xl font-black uppercase tracking-wide text-foreground">
                Player Report
              </h2>
              <p className="mt-1 text-sm font-semibold text-muted-foreground">Loading dossier…</p>
            </>
          ) : (
            <>
              <h2 className="font-display text-xl font-black uppercase tracking-wide text-foreground">
                {formatPlayerFullName(report.player.first_name, report.player.last_name)}
              </h2>
              <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-extrabold uppercase tracking-widest text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <UserRound className="size-3.5" aria-hidden />
                  {report.player.age_group}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Shirt className="size-3.5" aria-hidden />
                  {report.currentPrimaryTeam
                    ? `${report.currentPrimaryTeam.teamName}${
                        report.currentPrimaryTeam.jersey != null
                          ? ` · #${report.currentPrimaryTeam.jersey}`
                          : ''
                      }`
                    : 'No primary team'}
                </span>
              </p>
            </>
          )}
        </div>
      </header>

      <div
        role="tablist"
        aria-label="Report timeframe"
        className="grid grid-cols-2 gap-2 rounded-xl border-2 border-border bg-background p-1"
      >
        <button
          type="button"
          role="tab"
          aria-selected={timeframe === 'career'}
          onClick={() => setTimeframe('career')}
          className={cn(
            'min-h-11 touch-manipulation rounded-lg px-3 text-xs font-extrabold uppercase tracking-wide',
            timeframe === 'career'
              ? 'bg-neon text-neon-foreground'
              : 'bg-transparent text-muted-foreground',
          )}
        >
          Career / Overall
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={timeframe === 'season'}
          disabled={!activeSeason}
          onClick={() => setTimeframe('season')}
          className={cn(
            'min-h-11 touch-manipulation rounded-lg px-3 text-xs font-extrabold uppercase tracking-wide disabled:opacity-40',
            timeframe === 'season'
              ? 'bg-neon text-neon-foreground'
              : 'bg-transparent text-muted-foreground',
          )}
        >
          {seasonLabel}
        </button>
      </div>

      {loading || !report || !totals ? (
        <p className="rounded-xl border-2 border-dashed border-border px-3 py-8 text-center text-sm font-semibold text-muted-foreground">
          Building development report…
        </p>
      ) : (
        <>
          <section className="space-y-2">
            <h3 className="font-display text-xs font-bold uppercase tracking-widest text-muted-foreground">
              Cumulative Analytics
            </h3>
            <TotalsGrid totals={totals} />
          </section>

          <section className="space-y-2">
            <h3 className="flex items-center gap-2 font-display text-xs font-bold uppercase tracking-widest text-muted-foreground">
              <CalendarRange className="size-4" aria-hidden />
              Team &amp; Roster History
            </h3>
            {rosterHistory.length === 0 ? (
              <p className="rounded-xl border-2 border-dashed border-border px-3 py-4 text-sm font-semibold text-muted-foreground">
                No primary roster assignments in this timeframe.
              </p>
            ) : (
              <ul className="space-y-2">
                {rosterHistory.map((entry) => (
                  <li
                    key={`${entry.seasonId}-${entry.teamId}`}
                    className="rounded-xl border-2 border-border bg-background px-3 py-3"
                  >
                    <p className="font-display text-sm font-bold uppercase tracking-wide text-foreground">
                      {entry.teamName}
                    </p>
                    <p className="mt-1 text-xs font-extrabold uppercase tracking-widest text-muted-foreground">
                      {entry.seasonName}
                      {entry.seasonRangeLabel ? ` · ${entry.seasonRangeLabel}` : ''}
                      {entry.jersey != null ? ` · #${entry.jersey}` : ''}
                      {entry.seasonStatus === 'active' ? ' · Active' : ''}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="space-y-2">
            <h3 className="font-display text-xs font-bold uppercase tracking-widest text-muted-foreground">
              Guest Play History
            </h3>
            {guestAppearances.length === 0 ? (
              <p className="rounded-xl border-2 border-dashed border-border px-3 py-4 text-sm font-semibold text-muted-foreground">
                No guest appearances in this timeframe.
              </p>
            ) : (
              <ul className="space-y-2">
                {guestAppearances.map((entry) => (
                  <li
                    key={entry.matchId}
                    className="rounded-xl border-2 border-athletic/50 bg-athletic/10 px-3 py-3"
                  >
                    <p className="text-sm font-extrabold text-foreground">
                      Guest played for {entry.teamName}
                    </p>
                    <p className="mt-1 text-xs font-bold text-muted-foreground">
                      {entry.opponent} · {entry.dateLabel}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </section>
  )
}
