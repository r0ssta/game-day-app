import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import { formatMatchDisplayDateTime } from '@/lib/match-schedule'
import { formatMatchResultScore } from '@/lib/penalty-kicks'
import {
  aggregateTeamShotSaveTotals,
  formatTeamShotSaveLine,
  hasTeamShotSaveTotals,
} from '@/lib/match-shot-save'
import {
  buildParentTimelineRows,
  fetchParentLiveEvents,
  filterParentLiveTimeline,
  formatParentEventLine,
  type ParentHubMatch,
  type ParentHubPlayer,
} from '@/lib/parent-hub'
import {
  buildParentMatchPlayerStats,
  type ParentMatchPlayerStat,
} from '@/lib/parent-match-stats'
import { cn } from '@/lib/utils'

type ParentFinishedMatchDetailProps = {
  match: ParentHubMatch
  players: ParentHubPlayer[]
  opponent: string
  onBack: () => void
}

function formatJersey(number: number | null): string {
  return number != null ? String(number) : '—'
}

function playerStatSummary(row: ParentMatchPlayerStat): string {
  const parts = [`G ${row.goals}`, `A ${row.assists}`]
  if (row.saves > 0) parts.push(`SV ${row.saves}`)
  if (row.yellowCards > 0) parts.push(`YC ${row.yellowCards}`)
  if (row.redCards > 0) parts.push(`RC ${row.redCards}`)
  return parts.join(' · ')
}

export function ParentFinishedMatchDetail({
  match,
  players,
  opponent,
  onBack,
}: ParentFinishedMatchDetailProps) {
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [playerStats, setPlayerStats] = useState<ParentMatchPlayerStat[]>([])
  const [eventsLoaded, setEventsLoaded] = useState(false)
  const [rawEvents, setRawEvents] = useState<Awaited<ReturnType<typeof fetchParentLiveEvents>>>([])

  const when = formatMatchDisplayDateTime(match)
  const score = formatMatchResultScore({
    home_score: match.home_score,
    away_score: match.away_score,
    home_pk_score: match.home_pk_score,
    away_pk_score: match.away_pk_score,
    pk_winner_is_us: match.pk_winner_is_us,
  })
  const recap = match.parent_facing_recap?.trim() ?? ''

  useEffect(() => {
    let cancelled = false

    void (async () => {
      setLoading(true)
      setLoadError(null)
      try {
        const events = await fetchParentLiveEvents(match.id)
        if (cancelled) return
        setRawEvents(events)
        setPlayerStats(
          buildParentMatchPlayerStats(events, match.id, match.half_length, players),
        )
        setEventsLoaded(true)
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : 'Could not load match stats')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [match.half_length, match.id, players])

  const timeline = useMemo(() => {
    if (!eventsLoaded) return []
    return buildParentTimelineRows(filterParentLiveTimeline(rawEvents))
  }, [eventsLoaded, rawEvents])

  const teamBoxScore = useMemo(() => aggregateTeamShotSaveTotals(rawEvents), [rawEvents])
  const teamBoxScoreLine = hasTeamShotSaveTotals(teamBoxScore)
    ? formatTeamShotSaveLine(teamBoxScore)
    : null

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex min-h-10 items-center gap-2 rounded-xl px-1 text-sm font-bold uppercase tracking-wide text-muted-foreground active:scale-95"
      >
        <ArrowLeft className="size-4" strokeWidth={2.5} />
        Back
      </button>

      <div className="rounded-xl border border-border bg-card px-4 py-4">
        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Final</p>
        <p className="mt-1 font-display text-2xl font-bold uppercase text-foreground">
          vs {opponent || 'Opponent'}
        </p>
        <p className="mt-1 text-sm font-semibold text-muted-foreground">
          {when.dateLabel} · {when.timeLabel}
        </p>
        <p className="mt-3 font-mono text-3xl font-black tabular-nums text-foreground">{score}</p>
        {teamBoxScoreLine ? (
          <p className="mt-2 text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
            {teamBoxScoreLine}
          </p>
        ) : null}
      </div>

      {loading ? (
        <p className="rounded-xl border border-border bg-card px-4 py-8 text-center text-sm text-muted-foreground">
          Loading match stats…
        </p>
      ) : null}

      {loadError ? (
        <p className="rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm font-semibold text-danger">
          {loadError}
        </p>
      ) : null}

      {!loading && !loadError ? (
        <>
          <section>
            <h2 className="mb-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">
              Player stats
            </h2>
            {playerStats.length === 0 ? (
              <p className="rounded-xl border border-border bg-card px-4 py-6 text-center text-sm text-muted-foreground">
                No player minutes recorded for this match.
              </p>
            ) : (
              <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
                {playerStats.map((row) => (
                  <li key={row.playerId} className="flex items-start gap-3 px-3 py-3.5">
                    <div
                      className={cn(
                        'flex size-10 shrink-0 items-center justify-center rounded-full border-2 border-border',
                        'font-display text-lg font-bold tabular-nums text-foreground',
                      )}
                    >
                      {formatJersey(row.jersey)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                        <span className="text-base font-bold text-foreground">{row.name}</span>
                        <span className="font-mono text-sm font-bold tabular-nums text-neon">
                          {row.minutesLabel}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">{row.positionsLabel}</p>
                      <p className="mt-1 text-xs font-semibold text-muted-foreground">
                        {playerStatSummary(row)}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {recap ? (
            <section>
              <h2 className="mb-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">
                Coach recap
              </h2>
              <div className="rounded-xl border border-border bg-card px-4 py-4">
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{recap}</p>
              </div>
            </section>
          ) : null}

          {timeline.length > 0 ? (
            <section>
              <h2 className="mb-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">
                Timeline
              </h2>
              <ul className="space-y-2">
                {timeline.map((row) => (
                  <li
                    key={row.id}
                    className="rounded-xl border border-border bg-card px-3 py-2.5 text-sm font-semibold text-foreground"
                  >
                    {row.kind === 'lineup' ? (
                      <div>
                        <p>{row.label}</p>
                        <p className="mt-1 text-xs font-medium leading-relaxed text-muted-foreground">
                          {row.players.join(' · ')}
                        </p>
                      </div>
                    ) : (
                      formatParentEventLine(row.event, opponent, {
                        periodIndex: row.periodIndex,
                      })
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      ) : null}
    </div>
  )
}
