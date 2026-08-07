import { useEffect, useState } from 'react'
import { BarChart3 } from 'lucide-react'
import { MatchRecapDetailView } from '@/components/MatchRecapDetailView'
import { ScreenHeader } from '@/components/AppNavigation'
import { formatMatchDisplayDateTime } from '@/lib/match-schedule'
import { fetchCompletedMatchesByTeamId } from '@/lib/supabase-api'
import type { DbMatch } from '@/types/database'
import type { RosterPlayer } from '@/types/match'

type ReportingScreenProps = {
  activeTeamId: string | null
  activeTeamName: string
  teamRoster: RosterPlayer[]
  onRefreshRoster: () => Promise<void>
  onBackToHome: () => void
}

function MatchHistoryList({
  activeTeamId,
  onViewRecap,
}: {
  activeTeamId: string | null
  onViewRecap: (match: DbMatch) => void
}) {
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [matches, setMatches] = useState<DbMatch[]>([])

  useEffect(() => {
    if (!activeTeamId) {
      setMatches([])
      setLoading(false)
      setLoadError(null)
      return
    }

    let cancelled = false

    void (async () => {
      setLoading(true)
      setLoadError(null)
      try {
        const completed = await fetchCompletedMatchesByTeamId(activeTeamId)
        if (!cancelled) setMatches(completed)
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : 'Failed to load match history')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [activeTeamId])

  if (!activeTeamId) {
    return (
      <p className="rounded-xl border border-border bg-card px-4 py-8 text-center text-sm text-muted-foreground">
        Select an active team on the Home screen to view match reports.
      </p>
    )
  }

  if (loading) {
    return (
      <p className="py-8 text-center text-sm font-semibold text-muted-foreground">
        Loading match history…
      </p>
    )
  }

  if (loadError) {
    return (
      <div className="rounded-xl border border-danger/40 bg-card p-6 text-center">
        <p className="font-bold text-danger">Failed to load match history</p>
        <p className="mt-2 text-sm text-muted-foreground">{loadError}</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="flex items-center gap-2 font-display text-base font-bold uppercase tracking-wide text-foreground">
          <BarChart3 className="size-5 text-athletic" />
          Match History & Recaps
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Completed matches with player stats, ratings, and coach summaries.
        </p>
      </div>

      {matches.length === 0 ? (
        <p className="rounded-xl border border-border bg-card px-4 py-8 text-center text-sm text-muted-foreground">
          No completed matches yet. Finish a game to see reports here.
        </p>
      ) : (
        <ul className="space-y-3">
          {matches.map((match) => {
            const { dateLabel, timeLabel } = formatMatchDisplayDateTime(match)

            return (
              <li
                key={match.id}
                className="rounded-xl border border-border bg-card p-4 shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-foreground">{dateLabel}</p>
                    <p className="text-xs text-muted-foreground">{timeLabel}</p>
                    <p className="mt-2 font-display text-lg font-bold uppercase tracking-wide text-foreground">
                      vs {match.opponent}
                    </p>
                    <p className="mt-1 font-mono text-sm font-bold tabular-nums text-blue-400">
                      Final {match.home_score} – {match.away_score}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onViewRecap(match)}
                    className="shrink-0 rounded-lg bg-neon px-3 py-2 text-xs font-bold uppercase tracking-wide text-neon-foreground active:scale-95"
                  >
                    View Recap
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      <section className="rounded-xl border border-dashed border-border bg-card/40 p-4">
        <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
          Coming Soon
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Season analytics, playing-time charts, and tactical breakdowns.
        </p>
      </section>
    </div>
  )
}

export function ReportingScreen({
  activeTeamId,
  activeTeamName,
  teamRoster,
  onRefreshRoster,
  onBackToHome,
}: ReportingScreenProps) {
  const [selectedMatch, setSelectedMatch] = useState<DbMatch | null>(null)

  useEffect(() => {
    void onRefreshRoster()
  }, [activeTeamId, onRefreshRoster])

  useEffect(() => {
    setSelectedMatch(null)
  }, [activeTeamId])

  if (selectedMatch) {
    return (
      <MatchRecapDetailView
        match={selectedMatch}
        teamName={activeTeamName}
        roster={teamRoster}
        onBack={() => setSelectedMatch(null)}
        onHome={onBackToHome}
      />
    )
  }

  return (
    <main className="min-h-dvh bg-background pb-10">
      <div className="mx-auto max-w-md space-y-5 px-4 pt-6">
        <ScreenHeader
          title="Reporting"
          subtitle={`Match history and recaps for ${activeTeamName || 'your team'}.`}
          onHome={onBackToHome}
        />

        <MatchHistoryList activeTeamId={activeTeamId} onViewRecap={setSelectedMatch} />
      </div>
    </main>
  )
}
