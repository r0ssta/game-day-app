import { ArrowLeft } from 'lucide-react'
import { formatRecapMinutes } from '@/lib/match-recap'
import { formatPlusMinus } from '@/lib/plus-minus'
import {
  formatPlayerSeasonHeader,
  formatPositionBreakdownDetail,
  formatPositionBreakdownLine,
  type PlayerSeasonStats,
} from '@/lib/season-reporting'
import { cn } from '@/lib/utils'
import { APP_CONTAINER, APP_SHELL, TOUCH_ICON_BUTTON } from '@/lib/layout'
import type { Impact, RosterPlayer } from '@/types/match'

function formatJersey(number: number | null) {
  return number !== null ? String(number) : '—'
}

function formatImpactLabel(impact: Impact) {
  if (impact === 'positive') return '+'
  if (impact === 'negative') return '−'
  return '='
}

const IMPACT_BADGE: Record<Impact, string> = {
  positive: 'bg-neon/15 text-neon',
  neutral: 'bg-secondary text-muted-foreground',
  negative: 'bg-danger/15 text-danger',
}

type PlayerSeasonProfileViewProps = {
  player: RosterPlayer
  stats: PlayerSeasonStats
  onBack: () => void
}

export function PlayerSeasonProfileView({ player, stats, onBack }: PlayerSeasonProfileViewProps) {
  const header = formatPlayerSeasonHeader(player, stats)

  return (
    <main className={`${APP_SHELL} pb-10 md:pb-12`}>
      <div className={`${APP_CONTAINER} space-y-5 pt-6 md:space-y-6 md:pt-8`}>
        <header className="flex items-start gap-3">
          <button
            type="button"
            onClick={onBack}
            aria-label="Back to player list"
            className={`${TOUCH_ICON_BUTTON} mt-1 bg-secondary`}
          >
            <ArrowLeft className="size-5" />
          </button>
          <div className="min-w-0">
            <h1 className="font-display text-2xl font-bold uppercase tracking-wide text-foreground">
              {header.name}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              #{formatJersey(header.jersey)} · Roster {header.rosterPrimary} /{' '}
              {header.rosterSecondary}
            </p>
          </div>
        </header>

        <section className="rounded-xl border border-border bg-card p-4">
          <h2 className="font-display text-xs font-bold uppercase tracking-widest text-muted-foreground">
            Season Totals
          </h2>
          <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Matches
              </dt>
              <dd className="mt-0.5 font-bold text-foreground">{stats.matchesPlayed}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Avg Minutes
              </dt>
              <dd className="mt-0.5 font-bold tabular-nums text-foreground">
                {header.avgMinutesLabel}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Total Minutes
              </dt>
              <dd className="mt-0.5 font-bold tabular-nums text-foreground">
                {header.totalMinutesLabel}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Goals
              </dt>
              <dd className="mt-0.5 font-bold tabular-nums text-foreground">{stats.goals}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Assists
              </dt>
              <dd className="mt-0.5 font-bold tabular-nums text-foreground">{stats.assists}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Yellow Cards
              </dt>
              <dd className="mt-0.5 font-bold tabular-nums text-amber-600">{stats.yellowCards}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Red Cards
              </dt>
              <dd className="mt-0.5 font-bold tabular-nums text-danger">{stats.redCards}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Plus/Minus
              </dt>
              <dd
                className={cn(
                  'mt-0.5 font-bold tabular-nums',
                  stats.plusMinus > 0
                    ? 'text-neon'
                    : stats.plusMinus < 0
                      ? 'text-danger'
                      : 'text-foreground',
                )}
              >
                {formatPlusMinus(stats.plusMinus)}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Top Positions
              </dt>
              <dd className="mt-0.5 font-bold text-foreground">
                {stats.primaryPositionPlayed}
                {stats.secondaryPositionPlayed !== '—'
                  ? ` · ${stats.secondaryPositionPlayed}`
                  : ''}
              </dd>
            </div>
          </dl>
        </section>

        <section className="rounded-xl border border-border bg-card p-4">
          <h2 className="font-display text-xs font-bold uppercase tracking-widest text-muted-foreground">
            Overall Performance
          </h2>
          <p className="mt-2 text-sm font-semibold text-foreground">
            Season average: {formatImpactLabel(stats.averageOverallRating)}
          </p>
          <div className="mt-3 flex flex-wrap gap-3">
            {(['positive', 'neutral', 'negative'] as const).map((impact) => (
              <div
                key={impact}
                className={cn(
                  'flex min-w-[4.5rem] flex-col items-center rounded-lg px-3 py-2',
                  IMPACT_BADGE[impact],
                )}
              >
                <span className="font-display text-xl font-black">
                  {formatImpactLabel(impact)}
                </span>
                <span className="text-xs font-bold tabular-nums">{stats.ratingCounts[impact]}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-xl border border-border bg-card p-4">
          <h2 className="font-display text-xs font-bold uppercase tracking-widest text-muted-foreground">
            Performance by Role
          </h2>
          {stats.positionBreakdown.length > 0 ? (
            <ul className="mt-3 space-y-2 text-sm text-foreground">
              {stats.positionBreakdown.map((entry) => (
                <li key={entry.position}>
                  <p className="font-semibold">{formatPositionBreakdownLine(entry)}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatPositionBreakdownDetail(entry)}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm italic text-muted-foreground">
              No multi-position role ratings yet
            </p>
          )}
        </section>

        <section className="rounded-xl border border-border bg-card p-4">
          <h2 className="font-display text-xs font-bold uppercase tracking-widest text-muted-foreground">
            Positions Played
          </h2>
          {stats.positionsPlayed.length > 0 ? (
            <p className="mt-2 text-sm font-semibold text-foreground">
              {stats.positionsPlayed.join(', ')}
            </p>
          ) : (
            <p className="mt-2 text-sm italic text-muted-foreground">No match data yet</p>
          )}
        </section>

        <section className="space-y-3">
          <h2 className="font-display text-xs font-bold uppercase tracking-widest text-muted-foreground">
            Coaching Notes History
          </h2>
          {stats.feedbackHistory.length === 0 ? (
            <p className="rounded-xl border border-border bg-card px-4 py-6 text-center text-sm italic text-muted-foreground">
              No written coaching notes for this player yet.
            </p>
          ) : (
            <ul className="space-y-2">
              {stats.feedbackHistory.map((entry) => (
                <li
                  key={`${entry.matchId}-${entry.position}-${entry.notes.slice(0, 24)}`}
                  className="rounded-xl border border-border bg-card p-3"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-bold text-foreground">{entry.dateLabel}</span>
                    <span className="text-xs text-muted-foreground">vs {entry.opponent}</span>
                    <span className="text-xs font-semibold text-muted-foreground">
                      {entry.position}
                    </span>
                    <span
                      className={cn(
                        'rounded px-1.5 py-0.5 text-[10px] font-bold',
                        IMPACT_BADGE[entry.impact],
                      )}
                    >
                      {formatImpactLabel(entry.impact)}
                    </span>
                  </div>
                  <p className="mt-2 text-sm leading-relaxed text-foreground">{entry.notes}</p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="space-y-3">
          <h2 className="font-display text-xs font-bold uppercase tracking-widest text-muted-foreground">
            Match Log
          </h2>
          {stats.matchLogs.length === 0 ? (
            <p className="rounded-xl border border-border bg-card px-4 py-6 text-center text-sm italic text-muted-foreground">
              No completed match appearances yet.
            </p>
          ) : (
            <ul className="divide-y divide-border rounded-xl border border-border bg-card">
              {stats.matchLogs.map((log) => (
                <li key={log.matchId} className="px-3 py-3">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="text-xs font-bold text-foreground">{log.dateLabel}</span>
                    <span className="text-xs text-muted-foreground">{log.venueLabel}</span>
                  </div>
                  <p className="mt-1 text-xs font-semibold text-muted-foreground">
                    {formatRecapMinutes(log.minutes)} · {log.positions.join(', ')} · G {log.goals}{' '}
                    · A {log.assists}
                    {log.yellowCards > 0 || log.redCards > 0
                      ? ` · YC ${log.yellowCards} · RC ${log.redCards}`
                      : ''}{' '}
                    · +/- {formatPlusMinus(log.plusMinus)}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <span
                      className={cn(
                        'rounded px-1.5 py-0.5 text-[10px] font-bold',
                        IMPACT_BADGE[log.overallRating.impact],
                      )}
                    >
                      Overall: {formatImpactLabel(log.overallRating.impact)}
                    </span>
                    {log.positionRatings.map((rating) => (
                      <span
                        key={`${log.matchId}-${rating.position}`}
                        className={cn(
                          'rounded px-1.5 py-0.5 text-[10px] font-bold',
                          IMPACT_BADGE[rating.impact],
                        )}
                      >
                        {rating.position}: {formatImpactLabel(rating.impact)}
                      </span>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  )
}
