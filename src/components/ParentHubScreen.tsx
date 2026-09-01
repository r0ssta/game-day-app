import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { CalendarDays, ChevronRight, Radio, ScrollText } from 'lucide-react'
import { ClubBrandMark } from '@/components/ClubBrandMark'
import { EnableAlertsButton } from '@/components/EnableAlertsButton'
import { InstallPrompt } from '@/components/InstallPrompt'
import { Spinner } from '@/components/Spinner'
import { formatTeamDisplayName } from '@/lib/age-groups'
import { formatMatchDisplayDateTime, getMatchSortTimestamp } from '@/lib/match-schedule'
import { formatMatchResultScore } from '@/lib/penalty-kicks'
import { formatPlayerFullName } from '@/lib/player-names'
import {
  buildParentTimelineRows,
  fetchParentHub,
  fetchParentLiveEvents,
  filterParentLiveTimeline,
  formatParentEventLine,
  isParentHubFinishedMatch,
  isParentHubLiveEventType,
  shouldShowParentLiveEvent,
  type ParentHubMatch,
  type ParentHubPayload,
  type ParentHubRoute,
  type ParentLiveEvent,
} from '@/lib/parent-hub'
import {
  aggregateTeamShotSaveTotals,
  formatTeamShotSaveLine,
  hasTeamShotSaveTotals,
} from '@/lib/match-shot-save'
import {
  applyParentHubManifestLink,
  applyParentHubPwaHead,
  rememberParentHubSlug,
} from '@/lib/parent-hub-pwa'
import { APP_CONTAINER } from '@/lib/layout'
import { cn } from '@/lib/utils'
import { supabase } from '@/supabaseClient'

const ParentFinishedMatchDetail = lazy(() =>
  import('@/components/ParentFinishedMatchDetail').then((m) => ({
    default: m.ParentFinishedMatchDetail,
  })),
)

type TabId = 'live' | 'schedule' | 'recaps'

type ParentHubScreenProps = {
  route: ParentHubRoute
}

function Scoreline({ match }: { match: ParentHubMatch }) {
  const score = formatMatchResultScore({
    home_score: match.home_score,
    away_score: match.away_score,
    home_pk_score: match.home_pk_score,
    away_pk_score: match.away_pk_score,
    pk_winner_is_us: match.pk_winner_is_us,
  })
  return <span className="font-mono text-base font-black tabular-nums text-foreground">{score}</span>
}

function kickoffDate(match: ParentHubMatch): Date | null {
  const ts = getMatchSortTimestamp(match)
  if (!Number.isFinite(ts) || ts <= 0) return null
  return new Date(ts)
}

function formatCountdown(ms: number): string {
  if (ms <= 0) return 'Kickoff soon'
  const totalSec = Math.floor(ms / 1000)
  const days = Math.floor(totalSec / 86400)
  const hours = Math.floor((totalSec % 86400) / 3600)
  const minutes = Math.floor((totalSec % 3600) / 60)
  const seconds = totalSec % 60
  if (days > 0) return `${days}d ${hours}h ${minutes}m`
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
  }
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

function ScheduledKickoffCard({ match }: { match: ParentHubMatch }) {
  const when = formatMatchDisplayDateTime(match)
  const kickoff = kickoffDate(match)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [])

  const remainingMs = kickoff ? kickoff.getTime() - now : 0
  const starters = match.starters ?? []

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-neon/40 bg-neon/10 px-4 py-4">
        <p className="text-[10px] font-bold uppercase tracking-widest text-neon">Upcoming</p>
        <p className="mt-1 font-display text-2xl font-bold uppercase text-foreground">
          vs {match.opponent || 'Opponent'}
        </p>
        <p className="mt-1 text-sm font-semibold text-muted-foreground">
          {when.dateLabel} · {when.timeLabel}
          {match.location_type === 'home' || match.location_type === 'away'
            ? ` · ${match.location_type === 'home' ? 'Home' : 'Away'}`
            : ''}
        </p>
        <p className="mt-4 font-display text-3xl font-black tabular-nums tracking-wide text-foreground">
          {kickoff ? formatCountdown(remainingMs) : 'Kickoff TBD'}
        </p>
        <p className="mt-1 text-xs font-bold uppercase tracking-widest text-muted-foreground">
          Until kickoff
        </p>
      </div>

      <div>
        <h3 className="mb-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">
          Starting lineup
        </h3>
        {starters.length === 0 ? (
          <p className="rounded-xl border border-border bg-card px-4 py-6 text-center text-sm text-muted-foreground">
            Lineup will appear once the coach preloads the match.
          </p>
        ) : (
          <ul className="space-y-2">
            {starters.map((player) => {
              const name = formatPlayerFullName(player.firstName, player.lastName)
              const label = player.number != null ? `#${player.number} ${name}` : name
              return (
                <li
                  key={player.id}
                  className="rounded-xl border border-border bg-card px-3 py-2.5 text-sm font-semibold text-foreground"
                >
                  {label}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}

function LiveTab({
  hub,
  matches,
}: {
  hub: ParentHubPayload
  matches: ParentHubMatch[]
}) {
  const liveMatch = useMemo(
    () => matches.find((m) => m.status === 'live') ?? null,
    [matches],
  )
  const nextScheduled = useMemo(() => {
    const upcoming = matches
      .filter((m) => m.status === 'scheduled')
      .sort((a, b) => getMatchSortTimestamp(a) - getMatchSortTimestamp(b))
    return upcoming[0] ?? null
  }, [matches])

  const [events, setEvents] = useState<ParentLiveEvent[]>([])
  const [liveMatchState, setLiveMatchState] = useState<ParentHubMatch | null>(liveMatch)

  useEffect(() => {
    setLiveMatchState(liveMatch)
  }, [liveMatch])

  useEffect(() => {
    if (!liveMatch) {
      setEvents([])
      return
    }
    let cancelled = false

    const loadEvents = async () => {
      try {
        const rows = await fetchParentLiveEvents(liveMatch.id)
        if (!cancelled) {
          setEvents(filterParentLiveTimeline(rows))
        }
      } catch (err) {
        console.warn('[ParentHub] live events hydrate failed', err)
      }
    }

    void loadEvents()
    // Poll as a backup when Realtime is blocked (RLS / network) so the timeline still moves.
    const pollId = window.setInterval(() => {
      void loadEvents()
    }, 8_000)

    return () => {
      cancelled = true
      window.clearInterval(pollId)
    }
  }, [liveMatch?.id])

  useEffect(() => {
    if (!liveMatch) return

    const channel = supabase
      .channel(`parent-live-${liveMatch.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'match_events',
          filter: `match_id=eq.${liveMatch.id}`,
        },
        (payload) => {
          const row = payload.new as {
            id: string
            match_id: string
            player_id: string | null
            event_type: string
            timestamp: number
            event_notes: string | null
            is_pk: boolean | null
            assist_player_id: string | null
            created_at: string
          }
          if (!isParentHubLiveEventType(row.event_type)) {
            return
          }
          if (
            !shouldShowParentLiveEvent({
              eventType: row.event_type,
              timestamp: row.timestamp,
              eventNotes: row.event_notes,
            })
          ) {
            return
          }

          const player = hub.players.find((p) => p.id === row.player_id)
          const assist = hub.players.find((p) => p.id === row.assist_player_id)
          const nextEvent: ParentLiveEvent = {
            id: row.id,
            matchId: row.match_id,
            playerId: row.player_id,
            playerName: player
              ? formatPlayerFullName(player.firstName, player.lastName)
              : null,
            jersey: player?.number ?? null,
            eventType: row.event_type,
            timestamp: row.timestamp,
            eventNotes: row.event_notes,
            isPk: row.is_pk,
            assistPlayerId: row.assist_player_id,
            assistPlayerName: assist
              ? formatPlayerFullName(assist.firstName, assist.lastName)
              : null,
            createdAt: row.created_at,
          }
          setEvents((prev) => {
            if (prev.some((e) => e.id === nextEvent.id)) return prev
            return filterParentLiveTimeline([...prev, nextEvent])
          })
          setLiveMatchState((prev) => {
            if (!prev) return prev
            if (row.event_type === 'goal') {
              return { ...prev, home_score: prev.home_score + 1 }
            }
            if (row.event_type === 'opponent_goal') {
              return { ...prev, away_score: prev.away_score + 1 }
            }
            return prev
          })
        },
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [liveMatch?.id, hub.players])

  if (!liveMatch || !liveMatchState) {
    if (!nextScheduled) {
      return (
        <p className="rounded-xl border border-dashed border-border bg-card px-4 py-8 text-center text-sm text-muted-foreground">
          No live match right now. Check back on game day.
        </p>
      )
    }
    return <ScheduledKickoffCard match={nextScheduled} />
  }

  const timeline = buildParentTimelineRows(events)
  const teamBoxScore = useMemo(() => aggregateTeamShotSaveTotals(events), [events])
  const teamBoxScoreLine = hasTeamShotSaveTotals(teamBoxScore)
    ? formatTeamShotSaveLine(teamBoxScore)
    : null

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-neon/40 bg-neon/10 px-4 py-4">
        <p className="text-[10px] font-bold uppercase tracking-widest text-neon">Live</p>
        <p className="mt-1 font-display text-2xl font-bold uppercase text-foreground">
          vs {liveMatchState.opponent || 'Opponent'}
        </p>
        <div className="mt-2 flex items-baseline gap-3">
          <Scoreline match={liveMatchState} />
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {liveMatchState.period_clock_started ? 'In progress' : 'Warmup / break'}
          </span>
        </div>
        {teamBoxScoreLine ? (
          <p className="mt-3 text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
            {teamBoxScoreLine}
          </p>
        ) : null}
      </div>

      <div>
        <h3 className="mb-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">
          Timeline
        </h3>
        {timeline.length === 0 ? (
          <p className="rounded-xl border border-border bg-card px-4 py-6 text-center text-sm text-muted-foreground">
            Waiting for the first event…
          </p>
        ) : (
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
                  formatParentEventLine(row.event, liveMatchState.opponent, {
                    periodIndex: row.periodIndex,
                  })
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function ScheduleTab({
  matches,
  onSelectMatch,
}: {
  matches: ParentHubMatch[]
  onSelectMatch: (match: ParentHubMatch) => void
}) {
  const sorted = useMemo(
    () => [...matches].sort((a, b) => getMatchSortTimestamp(b) - getMatchSortTimestamp(a)),
    [matches],
  )

  if (sorted.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-border bg-card px-4 py-8 text-center text-sm text-muted-foreground">
        No fixtures yet.
      </p>
    )
  }

  return (
    <ul className="space-y-2">
      {sorted.map((match) => {
        const when = formatMatchDisplayDateTime(match)
        const isDone = isParentHubFinishedMatch(match.status)
        const isLive = match.status === 'live'
        const isSelectable = isDone
        const row = (
          <>
            <div className="min-w-0">
              <p className="truncate font-bold text-foreground">
                vs {match.opponent || 'Opponent'}
              </p>
              <p className="text-xs text-muted-foreground">
                {when.dateLabel} · {when.timeLabel}
                {isLive ? ' · LIVE' : ''}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2 text-right">
              {isDone || isLive ? (
                <Scoreline match={match} />
              ) : (
                <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                  Upcoming
                </span>
              )}
              {isSelectable ? (
                <ChevronRight className="size-4 text-muted-foreground" strokeWidth={2.25} />
              ) : null}
            </div>
          </>
        )

        if (isSelectable) {
          return (
            <li key={match.id}>
              <button
                type="button"
                onClick={() => onSelectMatch(match)}
                className="flex w-full items-center justify-between gap-3 rounded-xl border border-border bg-card px-3 py-3 text-left active:scale-[0.99]"
              >
                {row}
              </button>
            </li>
          )
        }

        return (
          <li
            key={match.id}
            className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-3 py-3"
          >
            {row}
          </li>
        )
      })}
    </ul>
  )
}

function RecapsTab({
  matches,
  onSelectMatch,
}: {
  matches: ParentHubMatch[]
  onSelectMatch: (match: ParentHubMatch) => void
}) {
  const finished = useMemo(
    () =>
      matches
        .filter((m) => isParentHubFinishedMatch(m.status))
        .sort((a, b) => getMatchSortTimestamp(b) - getMatchSortTimestamp(a)),
    [matches],
  )

  if (finished.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-border bg-card px-4 py-8 text-center text-sm text-muted-foreground">
        Finished matches will appear here with player stats and coach recaps.
      </p>
    )
  }

  return (
    <ul className="space-y-3">
      {finished.map((match) => {
        const when = formatMatchDisplayDateTime(match)
        const recap = match.parent_facing_recap?.trim() ?? ''
        return (
          <li key={match.id}>
            <button
              type="button"
              onClick={() => onSelectMatch(match)}
              className="w-full rounded-xl border border-border bg-card px-4 py-4 text-left active:scale-[0.99]"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-display text-xl font-bold uppercase text-foreground">
                    vs {match.opponent || 'Opponent'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {when.dateLabel} · Final · <Scoreline match={match} />
                  </p>
                </div>
                <ChevronRight className="mt-1 size-5 shrink-0 text-muted-foreground" strokeWidth={2.25} />
              </div>
              {recap ? (
                <p className="mt-3 line-clamp-3 whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                  {recap}
                </p>
              ) : (
                <p className="mt-3 text-sm font-semibold text-neon">View player stats</p>
              )}
            </button>
          </li>
        )
      })}
    </ul>
  )
}

export function ParentHubScreen({ route }: ParentHubScreenProps) {
  const [hub, setHub] = useState<ParentHubPayload | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [tab, setTab] = useState<TabId>('live')
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null)

  // Point at the dynamic team manifest as soon as we know the slug (Vite stand-in for layout.tsx).
  useEffect(() => {
    if (route.kind === 'slug') {
      applyParentHubManifestLink(route.slug)
      rememberParentHubSlug(route.slug)
    }
  }, [route])

  useEffect(() => {
    if (!hub?.teamSlug) return
    rememberParentHubSlug(hub.teamSlug)
    return applyParentHubPwaHead({
      slug: hub.teamSlug,
      teamName: formatTeamDisplayName(hub.teamName, hub.ageGroup),
      brandColor: hub.brandColor,
      logoUrl: hub.logoUrl,
    })
  }, [hub])

  const reload = useCallback(async () => {
    const payload = await fetchParentHub(route)
    setHub(payload)
    // Canonicalize legacy UUID / query links to /hub/:slug once resolved.
    if (payload.teamSlug) {
      const canonical = `/hub/${encodeURIComponent(payload.teamSlug)}`
      const pathMismatch = window.location.pathname !== canonical
      const hasQuery = Boolean(window.location.search)
      if (pathMismatch || hasQuery) {
        window.history.replaceState(null, '', canonical)
      }
    }
  }, [route])

  useEffect(() => {
    let cancelled = false
    setLoadError(null)
    void reload()
      .catch((err) => {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : 'Could not load team hub')
        }
      })
    return () => {
      cancelled = true
    }
  }, [reload])

  // Soft refresh while viewing Live so schedule flips when a match goes active.
  useEffect(() => {
    if (tab !== 'live') return
    const id = window.setInterval(() => {
      void reload().catch(() => undefined)
    }, 30_000)
    return () => window.clearInterval(id)
  }, [tab, reload])

  const teamLabel = hub
    ? formatTeamDisplayName(hub.teamName, hub.ageGroup)
    : 'Team Hub'

  const selectedMatch = useMemo(
    () => hub?.matches.find((match) => match.id === selectedMatchId) ?? null,
    [hub, selectedMatchId],
  )

  const handleSelectFinishedMatch = useCallback((match: ParentHubMatch) => {
    if (!isParentHubFinishedMatch(match.status)) return
    setSelectedMatchId(match.id)
  }, [])

  const tabs: { id: TabId; label: string; icon: typeof Radio }[] = [
    { id: 'live', label: 'Live', icon: Radio },
    { id: 'schedule', label: 'Schedule', icon: CalendarDays },
    { id: 'recaps', label: 'Recaps', icon: ScrollText },
  ]

  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <InstallPrompt teamLabel={hub ? teamLabel : undefined} />

      <header className="border-b border-border bg-background/95 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur">
        <div className={`${APP_CONTAINER} space-y-3`}>
          <ClubBrandMark size="sm" priority />
          <div>
            <h1 className="font-display text-3xl font-bold uppercase tracking-wide text-foreground">
              {teamLabel}
            </h1>
            <p className="text-sm text-muted-foreground">Live scores · schedule · match stats</p>
          </div>
          {hub ? <EnableAlertsButton teamId={hub.teamId} players={hub.players} /> : null}
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto px-4 py-4 pb-28">
        <div className={`${APP_CONTAINER} space-y-4`}>
          {loadError ? (
            <p className="rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm font-semibold text-danger">
              {loadError}
            </p>
          ) : !hub ? (
            <p className="text-sm font-semibold text-muted-foreground">Loading team…</p>
          ) : selectedMatch && isParentHubFinishedMatch(selectedMatch.status) ? (
            <Suspense fallback={<Spinner />}>
              <ParentFinishedMatchDetail
                match={selectedMatch}
                players={hub.players}
                opponent={selectedMatch.opponent}
                onBack={() => setSelectedMatchId(null)}
              />
            </Suspense>
          ) : tab === 'live' ? (
            <LiveTab hub={hub} matches={hub.matches} />
          ) : tab === 'schedule' ? (
            <ScheduleTab matches={hub.matches} onSelectMatch={handleSelectFinishedMatch} />
          ) : (
            <RecapsTab matches={hub.matches} onSelectMatch={handleSelectFinishedMatch} />
          )}
        </div>
      </main>

      <nav
        className={cn(
          'fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur',
          selectedMatch ? 'hidden' : undefined,
        )}
      >
        <div className={`${APP_CONTAINER} grid grid-cols-3 gap-1`}>
          {tabs.map(({ id, label, icon: Icon }) => {
            const active = tab === id
            return (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={cn(
                  'flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-xl text-[10px] font-bold uppercase tracking-wide active:scale-95',
                  active ? 'bg-neon/15 text-neon' : 'text-muted-foreground',
                )}
              >
                <Icon className="size-5" strokeWidth={2.25} />
                {label}
              </button>
            )
          })}
        </div>
      </nav>
    </div>
  )
}
