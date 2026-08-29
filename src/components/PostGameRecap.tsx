import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ClipboardCopy, Mail, Trash2 } from 'lucide-react'
import { BackToHomeButton } from '@/components/AppNavigation'
import { DeleteMatchConfirmModal } from '@/components/DeleteMatchConfirmModal'
import { ParentRecapEmailModal } from '@/components/ParentRecapEmailModal'
import { QualitativeContextFields } from '@/components/QualitativeContextFields'
import {
  aggregatePlayerRecaps,
  buildRecapRows,
  buildRecapSummaryText,
  formatRecapMinutes,
  indexSavedReviews,
  OVERALL_REVIEW_POSITION,
  playerOverallReviewKey,
  playerPositionReviewKey,
  type PlayerRecapStats,
  type SavedPositionReview,
} from '@/lib/match-recap'
import { buildDisciplineCardSummaries } from '@/lib/match-cards'
import {
  EMPTY_QUALITATIVE_CONTEXT,
  formatQualitativeContextSummary,
  hasMatchTimingContext,
  parseQualitativeContext,
  serializeQualitativeContext,
  type QualitativeContext,
} from '@/lib/qualitative-context'
import {
  aggregateMicroStats,
  formatMicroStatsSummary,
  hasMicroStats,
  type PlayerMicroStats,
} from '@/lib/stat-tracker'
import {
  fetchMatchById,
  fetchMatchEvents,
  fetchMatchReviews,
  finalizeMatchReview,
  savePostGameReview,
} from '@/lib/supabase-api'
import {
  aggregateTeamShotSaveTotals,
  formatTeamShotSaveLine,
  hasTeamShotSaveTotals,
} from '@/lib/match-shot-save'
import {
  formatOpponentPrefix,
  formatOpponentWithVenue,
  formatVenueLabel,
  type LocationType,
} from '@/lib/match-location'
import { cn } from '@/lib/utils'
import { APP_CONTAINER, APP_SHELL } from '@/lib/layout'
import { formatMatchResultScore } from '@/lib/penalty-kicks'
import { ENABLE_POSITIONAL_RECAP_RATINGS } from '@/lib/feature-flags'
import {
  PLAYER_RATINGS,
  type PlayerRating,
} from '@/lib/player-rating'
import type { MatchPlayer } from '@/types/match'
import type { DbMatch, DbMatchEvent } from '@/types/database'

function formatJersey(number: number | null) {
  return number !== null ? String(number) : '—'
}

function ratingRingClass(rating: PlayerRating | null): string {
  if (rating == null) return 'border-border text-muted-foreground bg-secondary/40'
  if (rating >= 4) return 'border-neon text-neon bg-neon/10'
  if (rating <= 2) return 'border-danger text-danger bg-danger/10'
  return 'border-athletic text-athletic bg-athletic/10'
}

function RatingSelectGroup({
  rating,
  onSetRating,
  disabled = false,
}: {
  rating: PlayerRating | null
  onSetRating: (rating: PlayerRating | null) => void
  disabled?: boolean
}) {
  return (
    <div
      className="inline-flex w-full max-w-[16rem] shrink-0 overflow-hidden rounded-xl border border-border bg-secondary/40"
      role="group"
      aria-label="Player rating 1 to 5"
    >
      {PLAYER_RATINGS.map((value) => (
        <button
          key={value}
          type="button"
          aria-label={`Rating ${value}`}
          aria-pressed={rating === value}
          disabled={disabled}
          onClick={() => onSetRating(rating === value ? null : value)}
          className={cn(
            'min-h-11 min-w-0 flex-1 touch-manipulation px-1 py-2 text-sm font-black tabular-nums transition-colors active:scale-[0.98]',
            disabled && 'cursor-default opacity-70 active:scale-100',
            rating === value
              ? 'bg-neon text-neon-foreground shadow-inner'
              : 'bg-transparent text-muted-foreground hover:bg-secondary hover:text-foreground',
          )}
        >
          {value}
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
  homePkScore?: number
  awayPkScore?: number
  pkWinnerIsUs?: boolean | null
  halfLengthMinutes: number
  players: MatchPlayer[]
  isCompletedMatch?: boolean
  onFinalize: () => void
  onDeleteMatch?: (matchId: string) => Promise<void>
  canDeleteMatches?: boolean
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
  homePkScore = 0,
  awayPkScore = 0,
  pkWinnerIsUs = null,
  halfLengthMinutes,
  players,
  isCompletedMatch = false,
  onFinalize,
  onDeleteMatch,
  canDeleteMatches = false,
  onToast,
  onHome,
}: PostGameRecapProps) {
  const [readOnly, setReadOnly] = useState(isCompletedMatch)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [eventStats, setEventStats] = useState<Map<string, PlayerRecapStats>>(new Map())
  const [microStats, setMicroStats] = useState<Map<string, PlayerMicroStats>>(new Map())
  const [reviews, setReviews] = useState<Record<string, SavedPositionReview>>({})
  const [touchedPositionReviews, setTouchedPositionReviews] = useState<Set<string>>(() => new Set())
  const [coachSummary, setCoachSummary] = useState('')
  const [matchRecord, setMatchRecord] = useState<DbMatch | null>(null)
  const [matchEvents, setMatchEvents] = useState<DbMatchEvent[]>([])
  const [parentRecapOpen, setParentRecapOpen] = useState(false)
  const [qualitativeContext, setQualitativeContext] = useState<QualitativeContext>(
    EMPTY_QUALITATIVE_CONTEXT,
  )
  const [draftSavedAt, setDraftSavedAt] = useState<number | null>(null)
  const saveDraftRef = useRef<() => Promise<void>>(async () => {})

  useEffect(() => {
    let cancelled = false

    void (async () => {
      setLoading(true)
      setLoadError(null)
      try {
        const [events, loadedMatch] = await Promise.all([
          fetchMatchEvents(matchId),
          fetchMatchById(matchId),
        ])
        if (cancelled) return

        if (loadedMatch?.internal_coach_notes) {
          setCoachSummary(loadedMatch.internal_coach_notes)
        }
        if (loadedMatch) {
          setMatchRecord(loadedMatch)
        }
        setMatchEvents(events)
        if (loadedMatch?.qualitative_context) {
          setQualitativeContext(parseQualitativeContext(loadedMatch.qualitative_context))
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
        const savedReviews = indexSavedReviews(existingReviews)
        const recapRows = buildRecapRows(players, recapStats, savedReviews)

        const initialReviews: Record<string, SavedPositionReview> = {}
        const initialTouchedPositions = new Set<string>()
        for (const row of recapRows) {
          const overallKey = playerOverallReviewKey(row.playerId)
          if (savedReviews.has(overallKey)) {
            initialReviews[overallKey] = {
              rating: row.overallReview.rating,
              notes: row.overallReview.notes,
            }
          }
          for (const review of row.positionReviews) {
            const key = playerPositionReviewKey(row.playerId, review.position)
            if (!savedReviews.has(key)) continue
            initialReviews[key] = {
              rating: review.rating,
              notes: review.notes,
            }
            initialTouchedPositions.add(key)
          }
        }

        setReviews(initialReviews)
        setTouchedPositionReviews(initialTouchedPositions)
        setEventStats(recapStats)
        setMicroStats(aggregateMicroStats(events))
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
    () => buildRecapRows(players, eventStats, new Map(Object.entries(reviews))),
    [players, eventStats, reviews],
  )

  const disciplineSummaries = useMemo(
    () => buildDisciplineCardSummaries(matchEvents, players),
    [matchEvents, players],
  )
  const disciplineLines = useMemo(
    () => disciplineSummaries.map((row) => row.label),
    [disciplineSummaries],
  )
  const teamShotSaveTotals = useMemo(
    () => aggregateTeamShotSaveTotals(matchEvents),
    [matchEvents],
  )
  const teamShotSaveLine = useMemo(() => {
    return hasTeamShotSaveTotals(teamShotSaveTotals)
      ? formatTeamShotSaveLine(teamShotSaveTotals)
      : null
  }, [teamShotSaveTotals])

  const getSavedReview = (
    playerId: string,
    position: string,
    fallback: SavedPositionReview,
  ): SavedPositionReview => {
    const key =
      position === OVERALL_REVIEW_POSITION
        ? playerOverallReviewKey(playerId)
        : playerPositionReviewKey(playerId, position)
    return reviews[key] ?? fallback
  }

  const updateReview = (
    playerId: string,
    position: string,
    patch: Partial<SavedPositionReview>,
    options?: { markPositionTouched?: boolean },
  ) => {
    const key =
      position === OVERALL_REVIEW_POSITION
        ? playerOverallReviewKey(playerId)
        : playerPositionReviewKey(playerId, position)

    if (position !== OVERALL_REVIEW_POSITION && options?.markPositionTouched) {
      setTouchedPositionReviews((prev) => {
        if (prev.has(key)) return prev
        const next = new Set(prev)
        next.add(key)
        return next
      })
    }

    setReviews((prev) => ({
      ...prev,
      [key]: {
        rating: patch.rating !== undefined ? patch.rating : (prev[key]?.rating ?? null),
        notes: patch.notes ?? prev[key]?.notes ?? '',
      },
    }))
  }

  const reviewPayload = useMemo(
    () =>
      recapRows.flatMap((row) => {
        const overall = getSavedReview(row.playerId, OVERALL_REVIEW_POSITION, {
          rating: row.overallReview.rating,
          notes: row.overallReview.notes,
        })
        const entries: Array<{
          playerId: string
          position: string
          rating: PlayerRating
          notes: string
        }> = []

        if (overall.rating != null) {
          entries.push({
            playerId: row.playerId,
            position: OVERALL_REVIEW_POSITION,
            rating: overall.rating,
            notes: overall.notes,
          })
        }

        if (row.positionReviews.length > 1) {
          for (const review of row.positionReviews) {
            const key = playerPositionReviewKey(row.playerId, review.position)
            if (!touchedPositionReviews.has(key)) continue

            const saved = getSavedReview(row.playerId, review.position, {
              rating: review.rating,
              notes: review.notes,
            })
            if (saved.rating == null) continue
            entries.push({
              playerId: row.playerId,
              position: review.position,
              rating: saved.rating,
              notes: saved.notes,
            })
          }
        }

        return entries
      }),
    [recapRows, reviews, touchedPositionReviews],
  )

  const qualitativePayload = useMemo(
    () => serializeQualitativeContext(qualitativeContext),
    [qualitativeContext],
  )

  const qualitativeContextLines = useMemo(
    () => formatQualitativeContextSummary(qualitativeContext),
    [qualitativeContext],
  )

  const matchTimingLabel = useMemo(() => {
    if (!hasMatchTimingContext(qualitativeContext)) return null
    if (qualitativeContext.endedOnTime === true) return 'Ended on time'
    if (qualitativeContext.endedOnTime === false) {
      const added = qualitativeContext.addedTimeSeconds
      const m = Math.floor(added / 60)
      const s = added % 60
      return `Added time +${m}:${String(s).padStart(2, '0')}`
    }
    if (qualitativeContext.addedTimeSeconds > 0) {
      const added = qualitativeContext.addedTimeSeconds
      const m = Math.floor(added / 60)
      const s = added % 60
      return `Added time +${m}:${String(s).padStart(2, '0')}`
    }
    return null
  }, [qualitativeContext])

  const saveDraft = useCallback(async () => {
    await savePostGameReview(matchId, reviewPayload, coachSummary, qualitativePayload)
    setDraftSavedAt(Date.now())
  }, [matchId, reviewPayload, coachSummary, qualitativePayload])

  useEffect(() => {
    saveDraftRef.current = saveDraft
  }, [saveDraft])

  useEffect(() => {
    setReadOnly(isCompletedMatch)
  }, [matchId, isCompletedMatch])

  useEffect(() => {
    if (loading || readOnly) return
    const id = setTimeout(() => {
      void saveDraft().catch((err) => {
        console.warn('[PostGameRecap] draft auto-save failed', err)
      })
    }, 1200)
    return () => clearTimeout(id)
  }, [loading, readOnly, saveDraft])

  useEffect(() => {
    return () => {
      void saveDraftRef.current().catch((err) => {
        console.warn('[PostGameRecap] draft save on exit failed', err)
      })
    }
  }, [])

  const handleExit = async () => {
    if (readOnly) {
      onHome?.()
      return
    }
    try {
      await saveDraft()
      onHome?.()
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Failed to save draft')
    }
  }

  const handleSaveChanges = async () => {
    setSaving(true)
    try {
      await savePostGameReview(matchId, reviewPayload, coachSummary, qualitativePayload)
      onToast('Recap updated')
      setReadOnly(true)
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Failed to save recap')
    } finally {
      setSaving(false)
    }
  }

  const buildSummaryRows = () =>
    recapRows.map((row) => ({
      ...row,
      overallReview: {
        ...row.overallReview,
        ...getSavedReview(row.playerId, OVERALL_REVIEW_POSITION, {
          rating: row.overallReview.rating,
          notes: row.overallReview.notes,
        }),
      },
      sidelineStatsSummary: (() => {
        const stats = microStats.get(row.playerId)
        return stats && hasMicroStats(stats) ? formatMicroStatsSummary(stats) : null
      })(),
      positionReviews: row.positionReviews
        .filter((review) =>
          touchedPositionReviews.has(playerPositionReviewKey(row.playerId, review.position)),
        )
        .map((review) => ({
          ...review,
          ...getSavedReview(row.playerId, review.position, {
            rating: review.rating,
            notes: review.notes,
          }),
        })),
    }))

  const handleFinalize = async () => {
    setSaving(true)
    try {
      await savePostGameReview(matchId, reviewPayload, coachSummary, qualitativePayload)
      await finalizeMatchReview(matchId)

      const summary = buildRecapSummaryText({
        teamName,
        opponent,
        locationType,
        homeScore,
        awayScore,
        coachName,
        coachSummary,
        qualitativeContextLines,
        disciplineLines,
        teamShotSaveLine,
        rows: buildSummaryRows(),
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

  const handleEmail = () => {
    const summary = buildRecapSummaryText({
      teamName,
      opponent,
      locationType,
      homeScore,
      awayScore,
      coachName,
      coachSummary,
      qualitativeContextLines,
      disciplineLines,
      teamShotSaveLine,
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
      qualitativeContextLines,
      disciplineLines,
      teamShotSaveLine,
      rows: buildSummaryRows(),
    })
    void navigator.clipboard.writeText(summary).then(() => onToast('Summary copied'))
  }

  const handleConfirmDelete = async () => {
    if (!onDeleteMatch) return
    setDeleting(true)
    try {
      await onDeleteMatch(matchId)
      onToast('Match deleted')
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Failed to delete match')
      setDeleting(false)
      return
    }
    setDeleteConfirmOpen(false)
    setDeleting(false)
  }

  const scoreLabel = formatMatchResultScore({
    home_score: homeScore,
    away_score: awayScore,
    home_pk_score: homePkScore,
    away_pk_score: awayPkScore,
    pk_winner_is_us: pkWinnerIsUs,
  })
  const deleteMatchLabel = `${teamName} ${scoreLabel} ${formatOpponentPrefix(locationType)} ${opponent.trim() || 'Opponent'}`

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
    <>
    <main
      className={`${APP_SHELL} pb-[calc(14rem+env(safe-area-inset-bottom))] md:pb-[calc(15rem+env(safe-area-inset-bottom))]`}
    >
      <div className={`${APP_CONTAINER} space-y-5 pt-6 md:space-y-6 md:pt-8`}>
        <header className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1 text-center">
            <h1 className="font-display text-3xl font-black uppercase tracking-wide text-foreground">
              Post-Game Recap
            </h1>
            {isCompletedMatch ? (
              <p className="mt-1 text-xs font-bold uppercase tracking-widest text-muted-foreground">
                {readOnly ? 'Viewing saved recap' : 'Editing saved recap'}
              </p>
            ) : null}
            <p className="mt-2 flex flex-wrap items-center justify-center gap-2 text-sm text-muted-foreground">
              <span>
                {teamName} {scoreLabel} {formatOpponentPrefix(locationType)}{' '}
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
            {matchTimingLabel ? (
              <p className="mt-2 text-xs font-bold uppercase tracking-wide text-athletic">
                {matchTimingLabel}
              </p>
            ) : null}
          </div>
          {onHome ? <BackToHomeButton onClick={() => void handleExit()} /> : null}
        </header>

        <button
          type="button"
          onClick={() => setParentRecapOpen(true)}
          disabled={!matchRecord}
          className="flex min-h-14 w-full touch-manipulation items-center justify-center gap-2 rounded-2xl border-2 border-neon bg-neon px-4 text-sm font-black uppercase tracking-wide text-neon-foreground shadow-neon transition-transform active:scale-[0.99] disabled:opacity-50"
        >
          <Mail className="size-5" strokeWidth={2.5} />
          Generate Parent Recap Email
        </button>

        {isCompletedMatch ? (
          <div className="flex justify-center">
            <button
              type="button"
              onClick={() => setReadOnly((value) => !value)}
              className="min-h-11 touch-manipulation rounded-xl border-2 border-border bg-card px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-foreground active:scale-[0.98]"
            >
              {readOnly ? 'Edit Recap' : 'Switch to View Only'}
            </button>
          </div>
        ) : null}

        {!readOnly && draftSavedAt ? (
          <p className="text-center text-xs font-semibold text-muted-foreground">
            Draft saved — finalize when your review is complete.
          </p>
        ) : null}

        <section className="rounded-xl border border-neon/30 bg-neon/5 p-4">
          <label
            htmlFor="internal-coach-notes"
            className="mb-2 block font-display text-sm font-bold uppercase tracking-wide text-foreground"
          >
            Internal Coach Notes
          </label>
          <p className="mb-3 text-xs text-muted-foreground">
            Staff-only thoughts and developmental notes. These stay out of the parent email.
          </p>
          <textarea
            id="internal-coach-notes"
            value={coachSummary}
            onChange={(e) => setCoachSummary(e.target.value)}
            readOnly={readOnly}
            rows={5}
            placeholder="How did we play? What worked well? What should we focus on in training?"
            className={cn(
              'w-full resize-y rounded-xl border border-border bg-background px-4 py-3 text-sm leading-relaxed text-foreground placeholder:text-muted-foreground focus:border-neon focus:outline-none focus:ring-2 focus:ring-neon/30',
              readOnly && 'cursor-default bg-secondary/30',
            )}
          />
        </section>

        <QualitativeContextFields
          value={qualitativeContext}
          onChange={setQualitativeContext}
          readOnly={readOnly}
        />

        {teamShotSaveLine ? (
          <section className="rounded-xl border border-athletic/40 bg-athletic/5 p-4">
            <h2 className="font-display text-sm font-bold uppercase tracking-wide text-foreground">
              Box Score
            </h2>
            <p className="mt-2 text-sm font-semibold tabular-nums text-foreground">
              {teamShotSaveLine}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Home (us) – Away (opponent)
            </p>
          </section>
        ) : null}

        {disciplineSummaries.length > 0 ? (
          <section className="rounded-xl border border-amber-400/40 bg-amber-400/5 p-4">
            <h2 className="font-display text-sm font-bold uppercase tracking-wide text-foreground">
              Discipline / Cards
            </h2>
            <ul className="mt-3 space-y-1.5">
              {disciplineSummaries.map((row) => (
                <li key={row.playerId} className="text-sm font-semibold text-foreground">
                  {row.label}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="border-b border-border bg-secondary/40 px-4 py-3">
            <h2 className="font-display text-sm font-bold uppercase tracking-wide text-foreground">
              Player Review
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Rate overall match performance for every player. Nothing is selected until you tap a
              score — tap again to clear.
              {ENABLE_POSITIONAL_RECAP_RATINGS
                ? ' Position breakdowns are optional and only saved when you interact with a role rating.'
                : ''}
            </p>
          </div>

          <ul className="divide-y divide-border">
            {recapRows.map((row) => {
              const positionsLabel = row.positions.length > 0 ? row.positions.join(', ') : '—'
              const multiPosition = row.positionReviews.length > 1
              const overall = getSavedReview(row.playerId, OVERALL_REVIEW_POSITION, {
                rating: row.overallReview.rating,
                notes: row.overallReview.notes,
              })
              const playerMicroStats = microStats.get(row.playerId)
              const microSummary =
                playerMicroStats && hasMicroStats(playerMicroStats)
                  ? formatMicroStatsSummary(playerMicroStats)
                  : null

              return (
                <li key={row.playerId} className="space-y-4 px-3 py-4">
                  <div className="flex items-start gap-3">
                    <div
                      className={cn(
                        'flex size-10 shrink-0 items-center justify-center rounded-full border-2 font-display text-lg font-bold tabular-nums',
                        ratingRingClass(overall.rating),
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
                        {multiPosition ? `Played: ${positionsLabel}` : `Position: ${positionsLabel}`}
                      </p>
                      <p className="text-xs font-semibold text-muted-foreground">
                        Goals {row.goals} · Assists {row.assists}
                        {row.saves > 0 ? ` · Saves ${row.saves}` : ''}
                        {row.yellowCards > 0 || row.redCards > 0
                          ? ` · YC ${row.yellowCards} · RC ${row.redCards}`
                          : ''}
                      </p>
                      {microSummary ? (
                        <p className="mt-0.5 text-xs font-semibold text-athletic">
                          Sideline stats: {microSummary}
                        </p>
                      ) : null}
                    </div>
                  </div>

                  <div className="space-y-2 pl-[3.25rem]">
                    <div className="space-y-2 rounded-lg border border-border bg-secondary/30 p-3">
                      <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                        Overall Performance
                      </p>
                      <div className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-center">
                        <RatingSelectGroup
                          rating={overall.rating}
                          disabled={readOnly}
                          onSetRating={(rating) =>
                            updateReview(row.playerId, OVERALL_REVIEW_POSITION, { rating })
                          }
                        />
                        <input
                          type="text"
                          value={overall.notes}
                          readOnly={readOnly}
                          onChange={(e) =>
                            updateReview(row.playerId, OVERALL_REVIEW_POSITION, {
                              notes: e.target.value,
                            })
                          }
                          placeholder="Overall notes / comments"
                          className={cn(
                            'w-full min-w-0 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-neon focus:outline-none focus:ring-2 focus:ring-neon/30 md:flex-1',
                            readOnly && 'cursor-default bg-secondary/30',
                          )}
                        />
                      </div>
                    </div>

                    {ENABLE_POSITIONAL_RECAP_RATINGS && multiPosition ? (
                      <div className="space-y-3">
                        <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                          Position Breakdowns{' '}
                          <span className="font-semibold normal-case tracking-normal text-muted-foreground/80">
                            (optional)
                          </span>
                        </p>
                        {row.positionReviews.map((review) => {
                          const reviewKey = playerPositionReviewKey(row.playerId, review.position)
                          const saved = getSavedReview(row.playerId, review.position, {
                            rating: review.rating,
                            notes: review.notes,
                          })
                          const isTouched = touchedPositionReviews.has(reviewKey)

                          return (
                            <div
                              key={reviewKey}
                              className={cn(
                                'space-y-2 rounded-lg border p-3',
                                isTouched
                                  ? 'border-neon/20 bg-neon/5'
                                  : 'border-border bg-secondary/20',
                              )}
                            >
                              <div className="flex flex-col gap-2 md:flex-row md:flex-wrap md:items-center md:gap-3">
                                <span className="text-sm font-bold text-foreground">
                                  {review.position}
                                </span>
                                <RatingSelectGroup
                                  rating={saved.rating}
                                  disabled={readOnly}
                                  onSetRating={(rating) =>
                                    updateReview(row.playerId, review.position, { rating }, {
                                      markPositionTouched: true,
                                    })
                                  }
                                />
                              </div>
                              <input
                                type="text"
                                value={saved.notes}
                                readOnly={readOnly}
                                onChange={(e) =>
                                  updateReview(
                                    row.playerId,
                                    review.position,
                                    { notes: e.target.value },
                                    { markPositionTouched: true },
                                  )
                                }
                                placeholder={`Optional notes for ${review.position}`}
                                className={cn(
                                  'w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-neon focus:outline-none focus:ring-2 focus:ring-neon/30',
                                  readOnly && 'cursor-default bg-secondary/30',
                                )}
                              />
                            </div>
                          )
                        })}
                      </div>
                    ) : null}
                  </div>
                </li>
              )
            })}
          </ul>
        </section>

        <div className="fixed inset-x-0 bottom-0 border-t border-border bg-background/95 px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur">
          <div className={`${APP_CONTAINER} flex flex-col gap-2`}>
            {readOnly ? (
              isCompletedMatch ? (
                <button
                  type="button"
                  onClick={() => setReadOnly(false)}
                  className="w-full rounded-xl border-2 border-neon bg-neon py-4 font-display text-xl font-black uppercase tracking-wide text-neon-foreground shadow-lg shadow-neon/20 active:scale-[0.98]"
                >
                  Edit Recap
                </button>
              ) : null
            ) : isCompletedMatch ? (
              <button
                type="button"
                onClick={() => void handleSaveChanges()}
                disabled={saving}
                className="w-full rounded-xl bg-neon py-4 font-display text-xl font-black uppercase tracking-wide text-neon-foreground shadow-lg shadow-neon/20 active:scale-[0.98] disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Save Changes'}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void handleFinalize()}
                disabled={saving}
                className="w-full rounded-xl bg-neon py-4 font-display text-xl font-black uppercase tracking-wide text-neon-foreground shadow-lg shadow-neon/20 active:scale-[0.98] disabled:opacity-50"
              >
                {saving ? 'Finalizing…' : 'Finalize & Save'}
              </button>
            )}
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
            {canDeleteMatches && onDeleteMatch ? (
              <button
                type="button"
                onClick={() => setDeleteConfirmOpen(true)}
                disabled={deleting}
                className="delete-match-action flex min-h-12 w-full touch-manipulation items-center justify-center gap-2 rounded-xl border-2 border-danger/70 bg-danger/10 py-3 text-sm font-bold uppercase tracking-wide text-danger active:scale-[0.98] disabled:opacity-50"
              >
                <Trash2 className="size-4" strokeWidth={2.5} />
                Clear Match Data
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {canDeleteMatches && onDeleteMatch ? (
        <DeleteMatchConfirmModal
          open={deleteConfirmOpen}
          matchLabel={deleteMatchLabel}
          busy={deleting}
          onCancel={() => {
            if (!deleting) setDeleteConfirmOpen(false)
          }}
          onConfirm={() => void handleConfirmDelete()}
        />
      ) : null}

      {matchRecord ? (
        <ParentRecapEmailModal
          open={parentRecapOpen}
          match={{
            ...matchRecord,
            internal_coach_notes: coachSummary.trim() || null,
          }}
          teamName={teamName}
          events={matchEvents}
          players={players}
          onClose={() => setParentRecapOpen(false)}
          onToast={onToast}
          onParentFacingRecapSaved={(value) =>
            setMatchRecord((prev) =>
              prev ? { ...prev, parent_facing_recap: value || null } : prev,
            )
          }
        />
      ) : null}
    </main>
    </>
  )
}
