import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ClipboardCopy, Mail } from 'lucide-react'
import { BackToHomeButton } from '@/components/AppNavigation'
import {
  aggregatePlayerRecaps,
  buildRecapRows,
  buildRecapSummaryText,
  formatRecapMinutes,
  indexSavedReviews,
  playerPositionReviewKey,
  type PlayerRecapStats,
  type SavedPositionReview,
} from '@/lib/match-recap'
import {
  fetchMatchById,
  fetchMatchEvents,
  fetchMatchReviews,
  finalizeMatchReview,
  savePostGameReview,
} from '@/lib/supabase-api'
import {
  formatOpponentPrefix,
  formatOpponentWithVenue,
  formatVenueLabel,
  type LocationType,
} from '@/lib/match-location'
import { cn } from '@/lib/utils'
import { APP_CONTAINER, APP_SHELL } from '@/lib/layout'
import type { Impact, MatchPlayer } from '@/types/match'

function formatJersey(number: number | null) {
  return number !== null ? String(number) : '—'
}

const IMPACT_RING: Record<Impact, string> = {
  neutral: 'border-border text-muted-foreground',
  positive: 'border-neon text-neon bg-neon/10',
  negative: 'border-danger text-danger bg-danger/10',
}

function ImpactToggleGroup({
  impact,
  onSetImpact,
}: {
  impact: Impact
  onSetImpact: (impact: Impact) => void
}) {
  return (
    <div className="flex shrink-0 gap-1">
      {(['negative', 'neutral', 'positive'] as const).map((value) => (
        <button
          key={value}
          type="button"
          aria-label={`${value} rating`}
          onClick={() => onSetImpact(value)}
          className={cn(
            'flex size-11 min-h-11 min-w-11 touch-manipulation items-center justify-center rounded-md text-sm font-bold active:scale-90',
            impact === value
              ? value === 'positive'
                ? 'bg-neon text-neon-foreground'
                : value === 'negative'
                  ? 'bg-danger text-danger-foreground'
                  : 'bg-muted-foreground/30 text-foreground'
              : 'bg-secondary text-muted-foreground',
          )}
        >
          {value === 'negative' ? '−' : value === 'positive' ? '+' : '='}
        </button>
      ))}
    </div>
  )
}

type PostGameRecapProps = {
  matchId: string
  teamName: string
  coachName: string
  opponent: string
  locationType: LocationType
  homeScore: number
  awayScore: number
  halfLengthMinutes: number
  players: MatchPlayer[]
  onFinalize: () => void
  onToast: (message: string) => void
  onHome?: () => void
}

export function PostGameRecap({
  matchId,
  teamName,
  coachName,
  opponent,
  locationType,
  homeScore,
  awayScore,
  halfLengthMinutes,
  players,
  onFinalize,
  onToast,
  onHome,
}: PostGameRecapProps) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [eventStats, setEventStats] = useState<Map<string, PlayerRecapStats>>(new Map())
  const [reviews, setReviews] = useState<Record<string, SavedPositionReview>>({})
  const [coachSummary, setCoachSummary] = useState('')
  const [draftSavedAt, setDraftSavedAt] = useState<number | null>(null)
  const saveDraftRef = useRef<() => Promise<void>>(async () => {})

  useEffect(() => {
    let cancelled = false

    void (async () => {
      setLoading(true)
      setLoadError(null)
      try {
        const [events, matchRecord] = await Promise.all([
          fetchMatchEvents(matchId),
          fetchMatchById(matchId),
        ])
        if (cancelled) return

        if (matchRecord?.coach_summary_notes) {
          setCoachSummary(matchRecord.coach_summary_notes)
        }

        let existingReviews: Awaited<ReturnType<typeof fetchMatchReviews>> = []
        try {
          existingReviews = await fetchMatchReviews(matchId)
        } catch (reviewErr) {
          console.warn('[PostGameRecap] could not load saved reviews', reviewErr)
        }
        if (cancelled) return

        const recapStats = aggregatePlayerRecaps(
          events,
          halfLengthMinutes * 60,
          new Map(players.filter((p) => p.attending).map((player) => [player.id, player])),
        )
        const { savedReviews, legacyReviews } = indexSavedReviews(existingReviews)
        const recapRows = buildRecapRows(players, recapStats, savedReviews, legacyReviews)

        const initialReviews: Record<string, SavedPositionReview> = {}
        for (const row of recapRows) {
          for (const review of row.positionReviews) {
            initialReviews[playerPositionReviewKey(row.playerId, review.position)] = {
              impact: review.impact,
              notes: review.notes,
            }
          }
        }

        setReviews(initialReviews)
        setEventStats(recapStats)
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : 'Failed to load recap data')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [matchId, halfLengthMinutes, players])

  const recapRows = useMemo(
    () =>
      buildRecapRows(
        players,
        eventStats,
        new Map(Object.entries(reviews)),
        new Map(),
      ),
    [players, eventStats, reviews],
  )

  const updateReview = (
    playerId: string,
    position: string,
    patch: Partial<SavedPositionReview>,
  ) => {
    const key = playerPositionReviewKey(playerId, position)
    setReviews((prev) => ({
      ...prev,
      [key]: {
        impact: patch.impact ?? prev[key]?.impact ?? 'neutral',
        notes: patch.notes ?? prev[key]?.notes ?? '',
      },
    }))
  }

  const reviewPayload = useMemo(
    () =>
      recapRows.flatMap((row) =>
        row.positionReviews.map((review) => ({
          playerId: row.playerId,
          position: review.position,
          impact: reviews[playerPositionReviewKey(row.playerId, review.position)]?.impact ?? review.impact,
          notes:
            reviews[playerPositionReviewKey(row.playerId, review.position)]?.notes ?? review.notes,
        })),
      ),
    [recapRows, reviews],
  )

  const saveDraft = useCallback(async () => {
    await savePostGameReview(matchId, reviewPayload, coachSummary)
    setDraftSavedAt(Date.now())
  }, [matchId, reviewPayload, coachSummary])

  useEffect(() => {
    saveDraftRef.current = saveDraft
  }, [saveDraft])

  useEffect(() => {
    if (loading) return
    const id = setTimeout(() => {
      void saveDraft().catch((err) => {
        console.warn('[PostGameRecap] draft auto-save failed', err)
      })
    }, 1200)
    return () => clearTimeout(id)
  }, [loading, saveDraft])

  useEffect(() => {
    return () => {
      void saveDraftRef.current().catch((err) => {
        console.warn('[PostGameRecap] draft save on exit failed', err)
      })
    }
  }, [])

  const handleExit = async () => {
    try {
      await saveDraft()
      onHome?.()
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Failed to save draft')
    }
  }

  const handleFinalize = async () => {
    setSaving(true)
    try {
      await savePostGameReview(matchId, reviewPayload, coachSummary)
      await finalizeMatchReview(matchId)

      const summary = buildRecapSummaryText({
        teamName,
        opponent,
        locationType,
        homeScore,
        awayScore,
        coachName,
        coachSummary,
        rows: recapRows.map((row) => ({
          ...row,
          positionReviews: row.positionReviews.map((review) => ({
            ...review,
            impact:
              reviews[playerPositionReviewKey(row.playerId, review.position)]?.impact ??
              review.impact,
            notes:
              reviews[playerPositionReviewKey(row.playerId, review.position)]?.notes ??
              review.notes,
          })),
        })),
      })

      await navigator.clipboard.writeText(summary)
      onToast('Recap finalized — returning home')
      onFinalize()
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Failed to finalize recap')
    } finally {
      setSaving(false)
    }
  }

  const buildSummaryRows = () =>
    recapRows.map((row) => ({
      ...row,
      positionReviews: row.positionReviews.map((review) => ({
        ...review,
        impact:
          reviews[playerPositionReviewKey(row.playerId, review.position)]?.impact ?? review.impact,
        notes:
          reviews[playerPositionReviewKey(row.playerId, review.position)]?.notes ?? review.notes,
      })),
    }))

  const handleEmail = () => {
    const summary = buildRecapSummaryText({
      teamName,
      opponent,
      locationType,
      homeScore,
      awayScore,
      coachName,
      coachSummary,
      rows: buildSummaryRows(),
    })
    const subject = encodeURIComponent(
      `${teamName} · ${formatOpponentWithVenue(opponent, locationType)} — Post-Game Recap`,
    )
    const body = encodeURIComponent(summary)
    window.location.href = `mailto:?subject=${subject}&body=${body}`
  }

  const handleCopy = () => {
    const summary = buildRecapSummaryText({
      teamName,
      opponent,
      locationType,
      homeScore,
      awayScore,
      coachName,
      coachSummary,
      rows: buildSummaryRows(),
    })
    void navigator.clipboard.writeText(summary).then(() => onToast('Summary copied'))
  }

  if (loading) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-background px-4">
        <p className="text-sm font-semibold text-muted-foreground">Loading post-game recap…</p>
      </main>
    )
  }

  if (loadError) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-background px-4">
        <div className="max-w-md rounded-xl border border-danger/40 bg-card p-6 text-center">
          <p className="font-bold text-danger">Failed to load recap</p>
          <p className="mt-2 text-sm text-muted-foreground">{loadError}</p>
        </div>
      </main>
    )
  }

  return (
    <main className={`${APP_SHELL} pb-28 md:pb-32`}>
      <div className={`${APP_CONTAINER} space-y-5 pt-6 md:space-y-6 md:pt-8`}>
        <header className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1 text-center">
            <h1 className="font-display text-3xl font-black uppercase tracking-wide text-foreground">
              Post-Game Recap
            </h1>
            <p className="mt-2 flex flex-wrap items-center justify-center gap-2 text-sm text-muted-foreground">
              <span>
                {teamName} {homeScore} – {awayScore} {formatOpponentPrefix(locationType)}{' '}
                {opponent.trim() || 'Opponent'}
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
            {coachName.trim() ? (
              <p className="mt-1 text-xs font-semibold text-muted-foreground">
                Head Coach: {coachName.trim()}
              </p>
            ) : null}
          </div>
          {onHome ? <BackToHomeButton onClick={() => void handleExit()} /> : null}
        </header>

        {draftSavedAt ? (
          <p className="text-center text-xs font-semibold text-muted-foreground">
            Draft saved — finalize when your review is complete.
          </p>
        ) : null}

        <section className="rounded-xl border border-neon/30 bg-neon/5 p-4">
          <label
            htmlFor="coach-match-summary"
            className="mb-2 block font-display text-sm font-bold uppercase tracking-wide text-foreground"
          >
            Coach&apos;s Match Summary
          </label>
          <p className="mb-3 text-xs text-muted-foreground">
            Overall game thoughts, tactical takeaways, and what to work on next.
          </p>
          <textarea
            id="coach-match-summary"
            value={coachSummary}
            onChange={(e) => setCoachSummary(e.target.value)}
            rows={5}
            placeholder="How did we play? What worked well? What should we focus on in training?"
            className="w-full resize-y rounded-xl border border-border bg-background px-4 py-3 text-sm leading-relaxed text-foreground placeholder:text-muted-foreground focus:border-neon focus:outline-none focus:ring-2 focus:ring-neon/30"
          />
        </section>

        <section className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="border-b border-border bg-secondary/40 px-4 py-3">
            <h2 className="font-display text-sm font-bold uppercase tracking-wide text-foreground">
              Player Review by Position
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Rate each role separately when a player changed positions during the match.
            </p>
          </div>

          <ul className="divide-y divide-border">
            {recapRows.map((row) => {
              const positionsLabel = row.positions.length > 0 ? row.positions.join(', ') : '—'
              const multiPosition = row.positionReviews.length > 1

              if (!multiPosition) {
                const review = row.positionReviews[0]
                if (!review) return null
                const reviewKey = playerPositionReviewKey(row.playerId, review.position)
                const saved = reviews[reviewKey] ?? review

                return (
                  <li key={row.playerId} className="space-y-3 px-3 py-4">
                    <div className="flex items-start gap-3">
                      <div
                        className={cn(
                          'flex size-10 shrink-0 items-center justify-center rounded-full border-2 font-display text-lg font-bold tabular-nums',
                          IMPACT_RING[saved.impact],
                        )}
                      >
                        {formatJersey(row.number)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className="text-base font-bold text-foreground">{row.name}</span>
                          <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] font-bold uppercase text-muted-foreground">
                            {review.position}
                          </span>
                          <span className="font-mono text-sm font-bold tabular-nums text-blue-400">
                            {formatRecapMinutes(row.totalSeconds)}
                          </span>
                        </div>
                        <p className="mt-0.5 text-xs font-semibold text-muted-foreground">
                          Goals {row.goals} · Assists {row.assists}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 pl-[3.25rem]">
                      <ImpactToggleGroup
                        impact={saved.impact}
                        onSetImpact={(impact) =>
                          updateReview(row.playerId, review.position, { impact })
                        }
                      />
                      <input
                        type="text"
                        value={saved.notes}
                        onChange={(e) =>
                          updateReview(row.playerId, review.position, { notes: e.target.value })
                        }
                        placeholder="Notes / comments"
                        className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-neon focus:outline-none focus:ring-2 focus:ring-neon/30"
                      />
                    </div>
                  </li>
                )
              }

              return (
                <li key={row.playerId} className="space-y-3 px-3 py-4">
                  <div className="flex items-start gap-3 border-b border-border/60 pb-3">
                    <div
                      className={cn(
                        'flex size-10 shrink-0 items-center justify-center rounded-full border-2 font-display text-lg font-bold tabular-nums',
                        IMPACT_RING[row.positionReviews[0]?.impact ?? 'neutral'],
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
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        Played: {positionsLabel}
                      </p>
                      <p className="text-xs font-semibold text-muted-foreground">
                        Goals {row.goals} · Assists {row.assists}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-4 pl-[3.25rem]">
                    {row.positionReviews.map((review) => {
                      const reviewKey = playerPositionReviewKey(row.playerId, review.position)
                      const saved = reviews[reviewKey] ?? review

                      return (
                        <div
                          key={reviewKey}
                          className="space-y-2 rounded-lg border border-neon/20 bg-neon/5 p-3"
                        >
                          <div className="flex flex-wrap items-center gap-3">
                            <span className="text-sm font-bold text-foreground">
                              {row.name} - {review.position}
                            </span>
                            <ImpactToggleGroup
                              impact={saved.impact}
                              onSetImpact={(impact) =>
                                updateReview(row.playerId, review.position, { impact })
                              }
                            />
                          </div>
                          <input
                            type="text"
                            value={saved.notes}
                            onChange={(e) =>
                              updateReview(row.playerId, review.position, { notes: e.target.value })
                            }
                            placeholder={`Notes for ${review.position}`}
                            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-neon focus:outline-none focus:ring-2 focus:ring-neon/30"
                          />
                        </div>
                      )
                    })}
                  </div>
                </li>
              )
            })}
          </ul>
        </section>

        <div className="fixed inset-x-0 bottom-0 border-t border-border bg-background/95 px-4 py-4 backdrop-blur">
          <div className={`${APP_CONTAINER} flex flex-col gap-2`}>
            <button
              type="button"
              onClick={() => void handleFinalize()}
              disabled={saving}
              className="w-full rounded-xl bg-neon py-4 font-display text-xl font-black uppercase tracking-wide text-neon-foreground shadow-lg shadow-neon/20 active:scale-[0.98] disabled:opacity-50"
            >
              {saving ? 'Finalizing…' : 'Finalize & Save'}
            </button>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={handleEmail}
                className="flex items-center justify-center gap-2 rounded-xl border border-border bg-card py-3 text-sm font-bold uppercase tracking-wide text-foreground active:scale-[0.98]"
              >
                <Mail className="size-4" />
                Email
              </button>
              <button
                type="button"
                onClick={handleCopy}
                className="flex items-center justify-center gap-2 rounded-xl border border-border bg-card py-3 text-sm font-bold uppercase tracking-wide text-foreground active:scale-[0.98]"
              >
                <ClipboardCopy className="size-4" />
                Copy
              </button>
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}
