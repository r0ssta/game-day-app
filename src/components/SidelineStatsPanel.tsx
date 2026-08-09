import { useEffect, useMemo, useState } from 'react'
import { ClipboardList } from 'lucide-react'
import { AnalyticsModule } from '@/components/reporting/AnalyticsModule'
import {
  aggregateMicroStats,
  buildStatTrackerFeed,
  formatStatTrackerFeedLine,
  type StatTrackerRosterPlayer,
} from '@/lib/stat-tracker'
import { fetchMatchEvents } from '@/lib/supabase-api'
import { formatPlayerFullName } from '@/lib/player-names'
import type { MatchPlayer } from '@/types/match'

type SidelineStatsPanelProps = {
  matchId: string
  players: MatchPlayer[]
  pollMs?: number
}

export function SidelineStatsPanel({ matchId, players, pollMs = 5000 }: SidelineStatsPanelProps) {
  const [eventCount, setEventCount] = useState(0)
  const [feedPreview, setFeedPreview] = useState<
    Array<{ id: string; line: string }>
  >([])

  const rosterById = useMemo(() => {
    const roster = new Map<string, StatTrackerRosterPlayer>()
    for (const player of players.filter((entry) => entry.attending)) {
      roster.set(player.id, {
        id: player.id,
        name: formatPlayerFullName(player.firstName, player.lastName),
        number: player.number,
      })
    }
    return roster
  }, [players])

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      try {
        const events = await fetchMatchEvents(matchId)
        if (cancelled) return

        const microStats = aggregateMicroStats(events)
        const totalEvents = [...microStats.values()].reduce(
          (sum, stats) =>
            sum +
            stats.shotsOnTarget +
            stats.shotsOffTarget +
            stats.statGoals +
            stats.statAssists +
            stats.dribbles +
            stats.tackles +
            stats.saves +
            stats.passes +
            stats.keyPasses,
          0,
        )

        setEventCount(totalEvents)
        setFeedPreview(
          buildStatTrackerFeed(events, rosterById)
            .slice(0, 5)
            .map((entry) => ({ id: entry.id, line: formatStatTrackerFeedLine(entry) })),
        )
      } catch {
        // Ignore transient polling errors during live play.
      }
    }

    void load()
    const intervalId = window.setInterval(() => {
      void load()
    }, pollMs)

    return () => {
      cancelled = true
      window.clearInterval(intervalId)
    }
  }, [matchId, pollMs, rosterById])

  if (eventCount === 0) return null

  const summary = `${eventCount} sideline stat${eventCount === 1 ? '' : 's'} logged`

  return (
    <AnalyticsModule
      title="Sideline Stats"
      description="Micro-events logged by parents or assistants via the stat tracker link."
      icon={ClipboardList}
      summary={summary}
      defaultOpen={false}
    >
      <ul className="space-y-2">
        {feedPreview.map((entry) => (
          <li
            key={entry.id}
            className="rounded-lg border border-border bg-secondary/20 px-3 py-2 text-sm font-semibold text-foreground"
          >
            {entry.line}
          </li>
        ))}
      </ul>
    </AnalyticsModule>
  )
}
