import { useEffect, useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import { BackToHomeButton } from '@/components/AppNavigation'
import {
  formatRecapMinutes,
  loadHistoricalRecapRows,
  type PlayerRecapReview,
} from '@/lib/match-recap'
import { formatMatchDisplayDateTime } from '@/lib/match-schedule'
import { cn } from '@/lib/utils'
import type { DbMatch } from '@/types/database'
import type { Impact, RosterPlayer } from '@/types/match'

function formatJersey(number: number | null) {
  return number !== null ? String(number) : '—'
}

function formatImpactLabel(impact: Impact) {
  if (impact === 'positive') return '+'
  if (impact === 'negative') return '−'
  return '='
}

const IMPACT_RING: Record<Impact, string> = {
  neutral: 'border-border text-muted-foreground',
  positive: 'border-neon text-neon bg-neon/10',
  negative: 'border-danger text-danger bg-danger/10',
}

type MatchRecapDetailViewProps = {
  match: DbMatch
  teamName: string
  roster: RosterPlayer[]
  onBack: () => void
  onHome?: () => void
}

export function MatchRecapDetailView({ match, teamName, roster, onBack, onHome }: MatchRecapDetailViewProps) {
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [rows, setRows] = useState<PlayerRecapReview[]>([])

  const { dateLabel, timeLabel } = formatMatchDisplayDateTime(match)

  useEffect(() => {
    let cancelled = false

    void (async () => {
      setLoading(true)
      setLoadError(null)
      try {
        const recapRows = await loadHistoricalRecapRows(match.id, match.half_length, roster)
        if (!cancelled) setRows(recapRows)
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : 'Failed to load match recap')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [match.id, match.half_length, roster])

  return (
    <main className="min-h-dvh bg-background pb-10">
      <div className="mx-auto max-w-md space-y-5 px-4 pt-6">
        <header className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <button
              type="button"
              onClick={onBack}
              aria-label="Back to match history"
              className="mt-1 flex size-10 shrink-0 items-center justify-center rounded-lg bg-secondary active:scale-90"
            >
              <ArrowLeft className="size-5" />
            </button>
            <div className="min-w-0">
              <h1 className="font-display text-2xl font-bold uppercase tracking-wide text-foreground">
                Match Recap
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {teamName} {match.home_score} – {match.away_score} {match.opponent}
              </p>
            </div>
          </div>
          {onHome ? <BackToHomeButton onClick={onHome} /> : null}
        </header>

        <section className="rounded-xl border border-border bg-card p-4">
          <h2 className="font-display text-xs font-bold uppercase tracking-widest text-muted-foreground">
            Match Details
          </h2>
          <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Date</dt>
              <dd className="mt-0.5 font-semibold text-foreground">{dateLabel}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Time</dt>
              <dd className="mt-0.5 font-semibold text-foreground">{timeLabel}</dd>
            </div>
            <div className="col-span-2">
              <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Opponent</dt>
              <dd className="mt-0.5 font-semibold text-foreground">{match.opponent}</dd>
            </div>
          </dl>
        </section>

        <section className="rounded-xl border border-neon/30 bg-neon/5 p-4">
          <h2 className="font-display text-sm font-bold uppercase tracking-wide text-foreground">
            Coach&apos;s Notes
          </h2>
          <p className="mt-1 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Post-Game Executive Summary
          </p>
          {match.coach_summary_notes?.trim() ? (
            <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-foreground">
              {match.coach_summary_notes.trim()}
            </p>
          ) : (
            <p className="mt-3 text-sm italic text-muted-foreground">
              No coach summary recorded for this match.
            </p>
          )}
        </section>

        {loading && (
          <p className="py-8 text-center text-sm font-semibold text-muted-foreground">Loading recap…</p>
        )}

        {loadError && (
          <div className="rounded-xl border border-danger/40 bg-card p-6 text-center">
            <p className="font-bold text-danger">Failed to load recap</p>
            <p className="mt-2 text-sm text-muted-foreground">{loadError}</p>
          </div>
        )}

        {!loading && !loadError && (
          <div className="overflow-hidden rounded-xl border border-border bg-card">
            <div className="hidden border-b border-border bg-secondary/40 px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground sm:grid sm:grid-cols-[2.5rem_1fr_3.5rem_4rem] sm:gap-x-2">
              <span>#</span>
              <span>Player</span>
              <span className="text-center">Rating</span>
              <span className="text-right">Min</span>
            </div>

            {rows.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                No player data recorded for this match.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {rows.map((row) => {
                  const positionsLabel = row.positions.length > 0 ? row.positions.join(', ') : '—'

                  return (
                    <li key={row.playerId} className="space-y-2 px-3 py-4">
                      <div className="flex items-start gap-3">
                        <div
                          className={cn(
                            'flex size-10 shrink-0 items-center justify-center rounded-full border-2 font-display text-lg font-bold tabular-nums',
                            IMPACT_RING[row.impact],
                          )}
                        >
                          {formatJersey(row.number)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <span className="text-base font-bold text-foreground">{row.name}</span>
                            <span
                              className={cn(
                                'rounded px-1.5 py-0.5 text-xs font-bold',
                                row.impact === 'positive'
                                  ? 'bg-neon/15 text-neon'
                                  : row.impact === 'negative'
                                    ? 'bg-danger/15 text-danger'
                                    : 'bg-secondary text-muted-foreground',
                              )}
                            >
                              {formatImpactLabel(row.impact)}
                            </span>
                            <span className="font-mono text-sm font-bold tabular-nums text-blue-400">
                              {formatRecapMinutes(row.totalSeconds)}
                            </span>
                          </div>
                          <p className="mt-0.5 text-xs text-muted-foreground">{positionsLabel}</p>
                          <p className="text-xs font-semibold text-muted-foreground">
                            Goals {row.goals} · Assists {row.assists}
                          </p>
                          {row.notes.trim() ? (
                            <p className="mt-2 rounded-lg bg-secondary/50 px-3 py-2 text-xs text-foreground">
                              {row.notes.trim()}
                            </p>
                          ) : (
                            <p className="mt-1 text-xs italic text-muted-foreground">No coach notes</p>
                          )}
                        </div>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        )}
      </div>
    </main>
  )
}
