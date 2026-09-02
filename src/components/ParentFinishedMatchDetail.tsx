import { useEffect, useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import { formatMatchDisplayDateTime } from '@/lib/match-schedule'
import { fetchParentLiveEvents, type ParentHubMatch, type ParentHubPlayer } from '@/lib/parent-hub'
import { ParentMatchRecapView } from '@/components/ParentMatchRecapView'

type ParentFinishedMatchDetailProps = {
  match: ParentHubMatch
  players: ParentHubPlayer[]
  opponent: string
  teamName: string
  onBack: () => void
}

export function ParentFinishedMatchDetail({
  match,
  players,
  opponent,
  teamName,
  onBack,
}: ParentFinishedMatchDetailProps) {
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [rawEvents, setRawEvents] = useState<Awaited<ReturnType<typeof fetchParentLiveEvents>>>([])

  const when = formatMatchDisplayDateTime(match)

  useEffect(() => {
    let cancelled = false

    void (async () => {
      setLoading(true)
      setLoadError(null)
      try {
        const events = await fetchParentLiveEvents(match.id, {
          includeTest: Boolean(match.isTest),
        })
        if (cancelled) return
        setRawEvents(events)
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
  }, [match.id])

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
        <ParentMatchRecapView
          events={rawEvents}
          players={players}
          matchId={match.id}
          halfLengthMinutes={match.half_length}
          totalPeriods={match.total_periods}
          opponent={opponent}
          teamName={teamName}
          homeScore={match.home_score}
          awayScore={match.away_score}
          homePkScore={match.home_pk_score}
          awayPkScore={match.away_pk_score}
          pkWinnerIsUs={match.pk_winner_is_us}
          dateLabel={when.dateLabel}
          timeLabel={when.timeLabel}
          recap={match.parent_facing_recap ?? ''}
        />
      ) : null}
    </div>
  )
}
