import { useEffect, useMemo, useRef, useState } from 'react'
import { ClipboardList } from 'lucide-react'
import { AnalyticsModule } from '@/components/reporting/AnalyticsModule'
import {
  aggregateMicroStats,
  buildStatTrackerFeed,
  formatStatTrackerFeedLine,
  type StatTrackerRosterPlayer,
} from '@/lib/stat-tracker'
import { readLiveMatchEvents, publishLiveMatchEvents, subscribeLiveMatchEvents } from '@/lib/live-match-events'
import { fetchMatchEvents } from '@/lib/supabase-api'
import { supabase } from '@/supabaseClient'
import { formatPlayerFullName } from '@/lib/player-names'
import type { DbMatchEvent } from '@/types/database'
import type { MatchPlayer } from '@/types/match'

type SidelineStatsPanelProps = {
  matchId: string
  players: MatchPlayer[]
}

function sidelineSummary(events: DbMatchEvent[], rosterById: Map<string, StatTrackerRosterPlayer>) {
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
  const feedPreview = buildStatTrackerFeed(events, rosterById)
    .slice(0, 5)
    .map((entry) => ({ id: entry.id, line: formatStatTrackerFeedLine(entry) }))
  return { totalEvents, feedPreview }
}

function sameFeed(
  prev: Array<{ id: string; line: string }>,
  next: Array<{ id: string; line: string }>,
) {
  if (prev.length !== next.length) return false
  return prev.every((entry, index) => entry.id === next[index]?.id && entry.line === next[index]?.line)
}

export function SidelineStatsPanel({ matchId, players }: SidelineStatsPanelProps) {
  const [eventCount, setEventCount] = useState(0)
  const [feedPreview, setFeedPreview] = useState<Array<{ id: string; line: string }>>([])

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

  const rosterRef = useRef(rosterById)
  rosterRef.current = rosterById

  useEffect(() => {
    let cancelled = false
    let pollId = 0
    let publishedAt = 0

    const apply = (events: DbMatchEvent[]) => {
      if (cancelled) return
      const next = sidelineSummary(events, rosterRef.current)
      setEventCount((prev) => (prev === next.totalEvents ? prev : next.totalEvents))
      setFeedPreview((prev) => (sameFeed(prev, next.feedPreview) ? prev : next.feedPreview))
    }

    const load = () => {
      if (Date.now() - publishedAt < 500) return
      void fetchMatchEvents(matchId)
        .then((events) => {
          if (!cancelled) publishLiveMatchEvents(matchId, events)
        })
        .catch(() => {
          // Ignore transient errors during live play.
        })
    }

    const stopPoll = () => {
      if (!pollId) return
      window.clearInterval(pollId)
      pollId = 0
    }
    const startPoll = () => {
      if (pollId) return
      pollId = window.setInterval(load, 5_000)
    }

    const unsubscribe = subscribeLiveMatchEvents((publishedMatchId, events) => {
      if (publishedMatchId !== matchId) return
      publishedAt = Date.now()
      apply(events)
    })

    const cached = readLiveMatchEvents(matchId)
    if (cached) apply(cached)
    else load()

    // The live snapshot publishes this log when it hydrates. Poll only if Realtime is down,
    // and refetch on an event when that hydrate was skipped.
    startPoll()
    const channel = supabase
      .channel(`sideline-events-${matchId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'match_events',
          filter: `match_id=eq.${matchId}`,
        },
        () => {
          load()
        },
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') stopPoll()
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          startPoll()
        }
      })

    return () => {
      cancelled = true
      stopPoll()
      unsubscribe()
      void supabase.removeChannel(channel)
    }
  }, [matchId])

  useEffect(() => {
    const cached = readLiveMatchEvents(matchId)
    if (!cached) return
    const next = sidelineSummary(cached, rosterById)
    setEventCount((prev) => (prev === next.totalEvents ? prev : next.totalEvents))
    setFeedPreview((prev) => (sameFeed(prev, next.feedPreview) ? prev : next.feedPreview))
  }, [matchId, rosterById])

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
