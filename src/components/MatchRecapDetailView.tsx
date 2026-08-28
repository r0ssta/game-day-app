import { useEffect, useState } from 'react'
import { ArrowLeft, Mail } from 'lucide-react'
import { BackToHomeButton } from '@/components/AppNavigation'
import { ParentRecapEmailModal, playersFromRoster } from '@/components/ParentRecapEmailModal'
import {
  formatRecapMinutes,
  loadHistoricalRecapRows,
  type PlayerRecapReview,
} from '@/lib/match-recap'
import {
  formatQualitativeContextSummary,
  hasQualitativeContext,
  parseQualitativeContext,
} from '@/lib/qualitative-context'
import { formatMatchDisplayDateTime } from '@/lib/match-schedule'
import { fetchMatchEvents, resolveMatchCoachName } from '@/lib/supabase-api'
import {
  formatOpponentPrefix,
  formatVenueLabel,
  resolveMatchLocationType,
} from '@/lib/match-location'
import { cn } from '@/lib/utils'
import { APP_CONTAINER, APP_SHELL, TOUCH_ICON_BUTTON } from '@/lib/layout'
import { formatMatchResultScore } from '@/lib/penalty-kicks'
import type { DbMatch, DbMatchEvent } from '@/types/database'
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
  onToast?: (message: string) => void
}

export function MatchRecapDetailView({
  match,
  teamName,
  roster,
  onBack,
  onHome,
  onToast,
}: MatchRecapDetailViewProps) {
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [rows, setRows] = useState<PlayerRecapReview[]>([])
  const [events, setEvents] = useState<DbMatchEvent[]>([])
  const [parentRecapOpen, setParentRecapOpen] = useState(false)
  const [matchState, setMatchState] = useState(match)

  const { dateLabel, timeLabel } = formatMatchDisplayDateTime(matchState)
  const headCoach = resolveMatchCoachName(matchState, null)
  const locationType = resolveMatchLocationType(matchState)
  const opponentLabel = matchState.opponent.trim() || 'Opponent'
  const qualitativeContext = parseQualitativeContext(matchState.qualitative_context)
  const qualitativeLines = formatQualitativeContextSummary(qualitativeContext)

  useEffect(() => {
    setMatchState(match)
  }, [match])

  useEffect(() => {
    let cancelled = false

    void (async () => {
      setLoading(true)
      setLoadError(null)
      try {
        const [recapRows, matchEvents] = await Promise.all([
          loadHistoricalRecapRows(match.id, match.half_length, roster),
          fetchMatchEvents(match.id),
        ])
        if (!cancelled) {
          setRows(recapRows)
          setEvents(matchEvents)
        }
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

  const toast = onToast ?? (() => {})

  return (
    <>
    <main className={`${APP_SHELL} pb-10 md:pb-12`}>
      <div className={`${APP_CONTAINER} space-y-5 pt-6 md:space-y-6 md:pt-8`}>
        <header className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <button
              type="button"
              onClick={onBack}
              aria-label="Back to match history"
              className={`${TOUCH_ICON_BUTTON} mt-1 bg-secondary`}
            >
              <ArrowLeft className="size-5" />
            </button>
            <div className="min-w-0">
              <h1 className="font-display text-2xl font-bold uppercase tracking-wide text-foreground">
                Match Recap
              </h1>
              <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                <span>
                  {teamName} {formatMatchResultScore(matchState)}{' '}
                  {formatOpponentPrefix(locationType)} {opponentLabel}
                </span>
                <span
                  className={cn(
                    'rounded px-1.5 py-0.5 text-[10px] font-bold uppercase',
                    locationType === 'home'
                      ? 'bg-neon/15 text-neon'
                      : 'bg-secondary text-muted-foreground',
                  )}
                >
                  {formatVenueLabel(locationType)}
                </span>
              </p>
            </div>
          </div>
          {onHome ? <BackToHomeButton onClick={onHome} /> : null}
        </header>

        <button
          type="button"
          onClick={() => setParentRecapOpen(true)}
          className="flex min-h-14 w-full touch-manipulation items-center justify-center gap-2 rounded-2xl border-2 border-neon bg-neon px-4 text-sm font-black uppercase tracking-wide text-neon-foreground shadow-neon transition-transform active:scale-[0.99]"
        >
          <Mail className="size-5" strokeWidth={2.5} />
          Generate Parent Recap Email
        </button>

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
              <dd className="mt-0.5 flex flex-wrap items-center gap-2 font-semibold text-foreground">
                <span>
                  {formatOpponentPrefix(locationType)} {opponentLabel}
                </span>
                <span
                  className={cn(
                    'rounded px-1.5 py-0.5 text-[10px] font-bold uppercase',
                    locationType === 'home'
                      ? 'bg-neon/15 text-neon'
                      : 'bg-secondary text-muted-foreground',
                  )}
                >
                  {formatVenueLabel(locationType)}
                </span>
              </dd>
            </div>
            {headCoach ? (
              <div className="col-span-2">
                <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Head Coach
                </dt>
                <dd className="mt-0.5 font-semibold text-foreground">{headCoach}</dd>
              </div>
            ) : null}
          </dl>
        </section>

        <section className="rounded-xl border border-neon/30 bg-neon/5 p-4">
          <h2 className="font-display text-sm font-bold uppercase tracking-wide text-foreground">
            Internal Coach Notes
          </h2>
          <p className="mt-1 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Staff only — not included in parent emails
          </p>
          {matchState.internal_coach_notes?.trim() ? (
            <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-foreground">
              {matchState.internal_coach_notes.trim()}
            </p>
          ) : (
            <p className="mt-3 text-sm italic text-muted-foreground">
              No internal coach notes recorded for this match.
            </p>
          )}
          {matchState.parent_facing_recap?.trim() ? (
            <div className="mt-4 border-t-2 border-border pt-3">
              <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                Parent-facing recap
              </p>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                {matchState.parent_facing_recap.trim()}
              </p>
            </div>
          ) : null}
        </section>

        {hasQualitativeContext(qualitativeContext) ? (
          <section className="rounded-xl border-2 border-border bg-card p-4">
            <h2 className="font-display text-sm font-bold uppercase tracking-wide text-foreground">
              Qualitative Context
            </h2>
            <ul className="mt-3 space-y-1.5 text-sm text-foreground">
              {qualitativeLines.slice(2).map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </section>
        ) : null}

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
                  const multiPosition = row.positionReviews.length > 1

                  return (
                    <li key={row.playerId} className="space-y-2 px-3 py-4">
                      <div className="flex items-start gap-3">
                        <div
                          className={cn(
                            'flex size-10 shrink-0 items-center justify-center rounded-full border-2 font-display text-lg font-bold tabular-nums',
                            IMPACT_RING[row.overallReview.impact],
                          )}
                        >
                          {formatJersey(row.number)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <span className="text-base font-bold text-foreground">{row.name}</span>
                            <span className="font-mono text-sm font-bold tabular-nums text-blue-400">
                              {formatRecapMinutes(row.totalSeconds)}
                            </span>
                          </div>
                          <p className="mt-0.5 text-xs text-muted-foreground">{positionsLabel}</p>
                          <p className="text-xs font-semibold text-muted-foreground">
                            Goals {row.goals} · Assists {row.assists}
                            {row.yellowCards > 0 || row.redCards > 0
                              ? ` · YC ${row.yellowCards} · RC ${row.redCards}`
                              : ''}
                          </p>
                          <div className="mt-2 space-y-2">
                            <div className="rounded-lg bg-secondary/50 px-3 py-2">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-xs font-bold text-foreground">
                                  Overall Performance
                                </span>
                                <span
                                  className={cn(
                                    'rounded px-1.5 py-0.5 text-[10px] font-bold',
                                    row.overallReview.impact === 'positive'
                                      ? 'bg-neon/15 text-neon'
                                      : row.overallReview.impact === 'negative'
                                        ? 'bg-danger/15 text-danger'
                                        : 'bg-secondary text-muted-foreground',
                                  )}
                                >
                                  {formatImpactLabel(row.overallReview.impact)}
                                </span>
                              </div>
                              {row.overallReview.notes.trim() ? (
                                <p className="mt-1 text-xs text-foreground">
                                  {row.overallReview.notes.trim()}
                                </p>
                              ) : (
                                <p className="mt-1 text-xs italic text-muted-foreground">
                                  No overall notes
                                </p>
                              )}
                            </div>

                            {multiPosition ? (
                              <div className="space-y-2">
                                <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                                  Position Breakdowns
                                </p>
                                {row.positionReviews.map((review) => (
                                  <div
                                    key={`${row.playerId}-${review.position}`}
                                    className="rounded-lg border border-neon/20 bg-neon/5 px-3 py-2"
                                  >
                                    <div className="flex flex-wrap items-center gap-2">
                                      <span className="text-xs font-bold text-foreground">
                                        {review.position}
                                      </span>
                                      <span
                                        className={cn(
                                          'rounded px-1.5 py-0.5 text-[10px] font-bold',
                                          review.impact === 'positive'
                                            ? 'bg-neon/15 text-neon'
                                            : review.impact === 'negative'
                                              ? 'bg-danger/15 text-danger'
                                              : 'bg-secondary text-muted-foreground',
                                        )}
                                      >
                                        {formatImpactLabel(review.impact)}
                                      </span>
                                    </div>
                                    {review.notes.trim() ? (
                                      <p className="mt-1 text-xs text-foreground">
                                        {review.notes.trim()}
                                      </p>
                                    ) : (
                                      <p className="mt-1 text-xs italic text-muted-foreground">
                                        No notes for {review.position}
                                      </p>
                                    )}
                                  </div>
                                ))}
                              </div>
                            ) : null}
                          </div>
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

    <ParentRecapEmailModal
      open={parentRecapOpen}
      match={matchState}
      teamName={teamName}
      events={events}
      players={playersFromRoster(roster)}
      onClose={() => setParentRecapOpen(false)}
      onToast={toast}
      onParentFacingRecapSaved={(value) =>
        setMatchState((prev) => ({ ...prev, parent_facing_recap: value || null }))
      }
    />
    </>
  )
}
