import { useEffect, useState } from 'react'
import { ClipboardList } from 'lucide-react'
import { ScreenHeader } from '@/components/AppNavigation'
import { formatMatchDisplayDateTime } from '@/lib/match-schedule'
import {
  formatOpponentPrefix,
  formatVenueLabel,
  resolveMatchLocationType,
} from '@/lib/match-location'
import { fetchRecapEligibleMatchesByTeamId, resolveMatchCoachName } from '@/lib/supabase-api'
import { APP_CONTAINER, APP_SHELL } from '@/lib/layout'
import { cn } from '@/lib/utils'
import type { DbMatch } from '@/types/database'

type MatchRecapHistoryScreenProps = {
  activeTeamId: string
  activeTeamName: string
  onOpenRecap: (matchId: string) => void
  onBackToHome: () => void
}

function statusBadge(status: DbMatch['status']) {
  if (status === 'pending_review') {
    return {
      label: 'Needs Recap',
      className: 'border-2 border-athletic bg-athletic/15 text-athletic',
    }
  }
  return {
    label: 'Completed',
    className: 'border-2 border-border bg-secondary text-muted-foreground',
  }
}

export function MatchRecapHistoryScreen({
  activeTeamId,
  activeTeamName,
  onOpenRecap,
  onBackToHome,
}: MatchRecapHistoryScreenProps) {
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [matches, setMatches] = useState<DbMatch[]>([])

  useEffect(() => {
    let cancelled = false

    void (async () => {
      setLoading(true)
      setLoadError(null)
      try {
        const rows = await fetchRecapEligibleMatchesByTeamId(activeTeamId)
        if (!cancelled) setMatches(rows)
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : 'Failed to load match recaps')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [activeTeamId])

  return (
    <main className={`${APP_SHELL} pb-10 md:pb-12`}>
      <div className={`${APP_CONTAINER} space-y-5 pt-6 md:space-y-6 md:pt-8`}>
        <ScreenHeader
          title="Match Recaps"
          subtitle={`Review or update post-game notes for ${activeTeamName || 'your team'}.`}
          onHome={onBackToHome}
        />

        <section className="rounded-xl border-2 border-border bg-card p-4">
          <div className="flex items-start gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-athletic/15">
              <ClipboardList className="size-5 text-athletic" strokeWidth={2.5} />
            </span>
            <div>
              <h2 className="font-display text-sm font-bold uppercase tracking-wide text-foreground">
                QA Recap Access
              </h2>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                Open any finished match to view ratings, sideline stats, and qualitative context.
                Completed recaps open in read-only mode — tap Edit to update notes anytime.
              </p>
            </div>
          </div>
        </section>

        {loading ? (
          <p className="py-8 text-center text-sm font-semibold text-muted-foreground">
            Loading match recaps…
          </p>
        ) : loadError ? (
          <div className="rounded-xl border-2 border-danger/40 bg-card p-6 text-center">
            <p className="font-bold text-danger">Failed to load recaps</p>
            <p className="mt-2 text-sm text-muted-foreground">{loadError}</p>
          </div>
        ) : matches.length === 0 ? (
          <p className="rounded-xl border-2 border-border bg-card px-4 py-8 text-center text-sm text-muted-foreground">
            No finished matches yet. Complete a game to access post-game recaps here.
          </p>
        ) : (
          <ul className="space-y-3">
            {matches.map((match) => {
              const { dateLabel, timeLabel } = formatMatchDisplayDateTime(match)
              const headCoach = resolveMatchCoachName(match, null)
              const locationType = resolveMatchLocationType(match)
              const opponentLabel = match.opponent.trim() || 'Opponent'
              const summary = match.coach_summary_notes?.trim()
              const badge = statusBadge(match.status)

              return (
                <li
                  key={match.id}
                  className="rounded-xl border-2 border-border bg-card p-4 shadow-sm"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-bold text-foreground">{dateLabel}</p>
                        <span
                          className={cn(
                            'rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide',
                            badge.className,
                          )}
                        >
                          {badge.label}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">{timeLabel}</p>
                      <p className="mt-2 flex flex-wrap items-center gap-2 font-display text-lg font-bold uppercase tracking-wide text-foreground">
                        <span>
                          {formatOpponentPrefix(locationType)} {opponentLabel}
                        </span>
                        <span
                          className={cn(
                            'rounded px-1.5 py-0.5 text-[10px] font-bold uppercase',
                            locationType === 'home'
                              ? 'border border-neon/40 bg-neon/15 text-neon'
                              : 'border border-border bg-secondary text-muted-foreground',
                          )}
                        >
                          {formatVenueLabel(locationType)}
                        </span>
                      </p>
                      <p className="mt-1 font-mono text-sm font-bold tabular-nums text-foreground">
                        Final {match.home_score} – {match.away_score}
                      </p>
                      {headCoach ? (
                        <p className="mt-1 text-xs font-semibold text-muted-foreground">
                          Head Coach: {headCoach}
                        </p>
                      ) : null}
                      {summary ? (
                        <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-foreground">
                          {summary}
                        </p>
                      ) : (
                        <p className="mt-2 text-xs italic text-muted-foreground">
                          No coach summary recorded
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => onOpenRecap(match.id)}
                      className="min-h-11 shrink-0 touch-manipulation rounded-xl border-2 border-neon bg-neon px-4 py-3 text-xs font-bold uppercase tracking-wide text-neon-foreground active:scale-[0.98]"
                    >
                      View Recap
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </main>
  )
}
