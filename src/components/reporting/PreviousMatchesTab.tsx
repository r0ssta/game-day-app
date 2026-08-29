import { formatMatchDisplayDateTime } from '@/lib/match-schedule'
import {
  formatOpponentPrefix,
  formatVenueLabel,
  resolveMatchLocationType,
} from '@/lib/match-location'
import { resolveMatchCoachName } from '@/lib/supabase-api'
import { GameRecapNeededAlerts } from '@/components/reporting/GameRecapNeededAlerts'
import type { SeasonReportData } from '@/lib/season-reporting'
import { SeasonRecordBanner } from '@/components/reporting/SeasonRecordBanner'
import { cn } from '@/lib/utils'
import type { DbMatch } from '@/types/database'
import { formatMatchFinalLabel } from '@/lib/penalty-kicks'

type PreviousMatchesTabProps = {
  data: SeasonReportData
  pendingReviewMatches: DbMatch[]
  onOpenPendingReview: (matchId: string) => void
  onOpenMatchRecap: (matchId: string) => void
}

export function PreviousMatchesTab({
  data,
  pendingReviewMatches,
  onOpenPendingReview,
  onOpenMatchRecap,
}: PreviousMatchesTabProps) {
  const { matches, seasonRecord } = data

  if (matches.length === 0 && pendingReviewMatches.length === 0) {
    return (
      <div className="space-y-4">
        <SeasonRecordBanner record={seasonRecord} />
        <p className="rounded-xl border border-border bg-card px-4 py-8 text-center text-sm text-muted-foreground">
          No completed matches yet. Finish a game to see reports here.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <GameRecapNeededAlerts
        matches={pendingReviewMatches}
        onOpenRecap={onOpenPendingReview}
      />

      <SeasonRecordBanner record={seasonRecord} />

      {matches.length === 0 ? (
        <p className="rounded-xl border border-border bg-card px-4 py-8 text-center text-sm text-muted-foreground">
          No finalized matches yet. Complete a pending recap to see it here.
        </p>
      ) : (
        <ul className="space-y-3">
          {matches.map((match) => {
          const { dateLabel, timeLabel } = formatMatchDisplayDateTime(match)
          const headCoach = resolveMatchCoachName(match, null)
          const locationType = resolveMatchLocationType(match)
          const opponentLabel = match.opponent.trim() || 'Opponent'
          const summary =
            match.parent_facing_recap?.trim() || match.internal_coach_notes?.trim()

          return (
            <li key={match.id}>
              <article className="rounded-xl border-2 border-border bg-card p-4 shadow-sm">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-foreground">{dateLabel}</p>
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
                      {formatMatchFinalLabel(match)}
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
                    onClick={() => onOpenMatchRecap(match.id)}
                    className="min-h-11 shrink-0 touch-manipulation rounded-xl border-2 border-neon bg-neon px-4 py-3 text-xs font-bold uppercase tracking-wide text-neon-foreground active:scale-[0.98]"
                  >
                    Edit Report
                  </button>
                </div>
              </article>
            </li>
          )
        })}
        </ul>
      )}
    </div>
  )
}
