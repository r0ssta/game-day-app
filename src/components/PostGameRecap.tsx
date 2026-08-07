import { useEffect, useMemo, useState } from 'react'
import { ClipboardCopy, Mail } from 'lucide-react'
import {
  aggregatePlayerRecaps,
  buildRecapRows,
  buildRecapSummaryText,
  formatRecapMinutes,
  type PlayerRecapStats,
} from '@/lib/match-recap'
import {
  fetchMatchEvents,
  fetchMatchReviews,
  savePostGameReview,
  scoreToImpact,
} from '@/lib/supabase-api'
import { cn } from '@/lib/utils'
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
            'flex size-8 items-center justify-center rounded-md text-sm font-bold active:scale-90',
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
  opponent: string
  homeScore: number
  awayScore: number
  halfLengthMinutes: number
  players: MatchPlayer[]
  onFinalize: () => void
  onToast: (message: string) => void
}

export function PostGameRecap({
  matchId,
  teamName,
  opponent,
  homeScore,
  awayScore,
  halfLengthMinutes,
  players,
  onFinalize,
  onToast,
}: PostGameRecapProps) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [eventStats, setEventStats] = useState<Map<string, PlayerRecapStats>>(new Map())
  const [reviews, setReviews] = useState<Record<string, { impact: Impact; notes: string }>>({})

  useEffect(() => {
    let cancelled = false

    void (async () => {
      setLoading(true)
      setLoadError(null)
      try {
        const events = await fetchMatchEvents(matchId)
        if (cancelled) return

        let existingReviews: Awaited<ReturnType<typeof fetchMatchReviews>> = []
        try {
          existingReviews = await fetchMatchReviews(matchId)
        } catch (reviewErr) {
          console.warn('[PostGameRecap] could not load saved reviews', reviewErr)
        }
        if (cancelled) return

        const initialReviews: Record<string, { impact: Impact; notes: string }> = {}
        for (const player of players.filter((p) => p.attending)) {
          const saved = existingReviews.find((r) => r.player_id === player.id)
          initialReviews[player.id] = {
            impact: saved ? scoreToImpact(saved.impact_score) : player.impact,
            notes: saved?.review_notes ?? '',
          }
        }
        setReviews(initialReviews)
        setEventStats(aggregatePlayerRecaps(events, halfLengthMinutes * 60))
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

  const updateReview = (playerId: string, patch: Partial<{ impact: Impact; notes: string }>) => {
    setReviews((prev) => ({
      ...prev,
      [playerId]: { ...prev[playerId], ...patch },
    }))
  }

  const rowsWithReviews = useMemo(
    () =>
      recapRows.map((row) => ({
        ...row,
        impact: reviews[row.playerId]?.impact ?? row.impact,
        notes: reviews[row.playerId]?.notes ?? row.notes,
      })),
    [recapRows, reviews],
  )

  const handleFinalize = async () => {
    setSaving(true)
    try {
      await savePostGameReview(
        matchId,
        rowsWithReviews.map((row) => ({
          playerId: row.playerId,
          impact: row.impact,
          notes: row.notes,
        })),
      )

      const summary = buildRecapSummaryText({
        teamName,
        opponent,
        homeScore,
        awayScore,
        rows: rowsWithReviews,
      })

      await navigator.clipboard.writeText(summary)
      onToast('Recap saved and copied to clipboard')
      onFinalize()
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Failed to save recap')
    } finally {
      setSaving(false)
    }
  }

  const handleEmail = () => {
    const summary = buildRecapSummaryText({
      teamName,
      opponent,
      homeScore,
      awayScore,
      rows: rowsWithReviews,
    })
    const subject = encodeURIComponent(`${teamName} vs ${opponent} — Post-Game Recap`)
    const body = encodeURIComponent(summary)
    window.location.href = `mailto:?subject=${subject}&body=${body}`
  }

  const handleCopy = () => {
    const summary = buildRecapSummaryText({
      teamName,
      opponent,
      homeScore,
      awayScore,
      rows: rowsWithReviews,
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
    <main className="min-h-dvh bg-background pb-28">
      <div className="mx-auto max-w-md space-y-5 px-4 pt-6">
        <header className="text-center">
          <h1 className="font-display text-3xl font-black uppercase tracking-wide text-foreground">
            Post-Game Recap
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {teamName} {homeScore} – {awayScore} {opponent}
          </p>
        </header>

        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="grid grid-cols-[2.5rem_1fr] gap-x-2 border-b border-border bg-secondary/40 px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            <span>#</span>
            <span>Player · Minutes · Positions · G/A</span>
          </div>

          <ul className="divide-y divide-border">
            {recapRows.map((row) => {
              const review = reviews[row.playerId] ?? { impact: row.impact, notes: row.notes }
              const positionsLabel = row.positions.length > 0 ? row.positions.join(', ') : '—'

              return (
                <li key={row.playerId} className="space-y-3 px-3 py-4">
                  <div className="flex items-start gap-3">
                    <div
                      className={cn(
                        'flex size-10 shrink-0 items-center justify-center rounded-full border-2 font-display text-lg font-bold tabular-nums',
                        IMPACT_RING[review.impact],
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
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-3 pl-[3.25rem]">
                    <ImpactToggleGroup
                      impact={review.impact}
                      onSetImpact={(impact) => updateReview(row.playerId, { impact })}
                    />
                    <input
                      type="text"
                      value={review.notes}
                      onChange={(e) => updateReview(row.playerId, { notes: e.target.value })}
                      placeholder="Notes / comments"
                      className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-neon focus:outline-none focus:ring-2 focus:ring-neon/30"
                    />
                  </div>
                </li>
              )
            })}
          </ul>
        </div>

        <div className="fixed inset-x-0 bottom-0 border-t border-border bg-background/95 px-4 py-4 backdrop-blur">
          <div className="mx-auto flex max-w-md flex-col gap-2">
            <button
              type="button"
              onClick={() => void handleFinalize()}
              disabled={saving}
              className="w-full rounded-xl bg-neon py-4 font-display text-xl font-black uppercase tracking-wide text-neon-foreground shadow-lg shadow-neon/20 active:scale-[0.98] disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Finalize & Save'}
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
