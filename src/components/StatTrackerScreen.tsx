import { useCallback, useEffect, useMemo, useState } from 'react'
import { CheckCircle2, ClipboardList, Users, X } from 'lucide-react'
import {
  STAT_TRACKER_ACTIONS,
  buildStatTrackerFeed,
  formatStatTrackerFeedLine,
  statTrackerActionLabel,
  type StatTrackerEventFeedItem,
  type StatTrackerEventType,
  type StatTrackerRosterPlayer,
} from '@/lib/stat-tracker'
import {
  formatMatchClockParts,
  restoreMatchClockSeconds,
} from '@/lib/match-clock'
import { parseQualitativeContext } from '@/lib/qualitative-context'
import {
  fetchMatchById,
  fetchMatchEvents,
  fetchStatTrackerContext,
  insertStatTrackerEvent,
} from '@/lib/supabase-api'
import { cn } from '@/lib/utils'
import { APP_CONTAINER, APP_SHELL, MODAL_OVERLAY, MODAL_PANEL } from '@/lib/layout'

type StatTrackerScreenProps = {
  matchId: string
  token: string
}

function formatJersey(number: number | null) {
  return number !== null ? String(number) : '—'
}

function formatTrackerClock(remainingSeconds: number) {
  const parts = formatMatchClockParts(remainingSeconds)
  return parts.addedLabel ? `${parts.regulation} ${parts.addedLabel}` : parts.regulation
}

function actionToneClass(tone: (typeof STAT_TRACKER_ACTIONS)[number]['tone']) {
  switch (tone) {
    case 'neon':
      return 'border-neon/40 bg-neon text-neon-foreground shadow-neon/20'
    case 'athletic':
      return 'border-athletic/40 bg-athletic text-white shadow-athletic/20'
    case 'danger':
      return 'border-danger/40 bg-danger text-danger-foreground shadow-danger/20'
    default:
      return 'border-border bg-card text-foreground shadow-md'
  }
}

function RecentLogsTicker({ entries }: { entries: StatTrackerEventFeedItem[] }) {
  if (entries.length === 0) return null

  const lines = entries.map((entry) => formatStatTrackerFeedLine(entry))

  return (
    <div className="sticky top-0 z-20 -mx-4 border-b border-neon/30 bg-neon/10 px-4 py-2 backdrop-blur md:-mx-0 md:rounded-xl md:border">
      <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-neon">Recent Logs</p>
      <div className="overflow-hidden">
        <div className="animate-[marquee_28s_linear_infinite] whitespace-nowrap text-sm font-semibold text-foreground">
          {lines.concat(lines).join('   ·   ')}
        </div>
      </div>
    </div>
  )
}

function PlayerAssignModal({
  actionLabel,
  actionIcon,
  roster,
  logging,
  onSelectPlayer,
  onAnonymous,
  onCancel,
}: {
  actionLabel: string
  actionIcon: string
  roster: StatTrackerRosterPlayer[]
  logging: boolean
  onSelectPlayer: (playerId: string) => void
  onAnonymous: () => void
  onCancel: () => void
}) {
  return (
    <div className={MODAL_OVERLAY} onClick={onCancel}>
      <div
        className={cn(MODAL_PANEL, 'max-h-[85dvh]')}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`Assign ${actionLabel}`}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border px-4 py-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              Who did it?
            </p>
            <p className="mt-1 font-display text-2xl font-black text-foreground">
              <span className="mr-2">{actionIcon}</span>
              {actionLabel}
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Cancel"
            className="flex size-11 items-center justify-center rounded-full bg-secondary text-foreground"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {roster.map((player) => (
              <button
                key={player.id}
                type="button"
                disabled={logging}
                onClick={() => onSelectPlayer(player.id)}
                className="flex min-h-[4.5rem] flex-col items-center justify-center rounded-2xl border border-border bg-secondary/30 px-2 py-3 text-center transition-transform active:scale-[0.97] disabled:opacity-50"
              >
                <span className="font-display text-2xl font-black tabular-nums text-neon">
                  {formatJersey(player.number)}
                </span>
                <span className="mt-1 line-clamp-2 text-xs font-bold leading-tight text-foreground">
                  {player.name}
                </span>
              </button>
            ))}
          </div>

          {roster.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No attending players found for this match.
            </p>
          ) : null}
        </div>

        <div className="shrink-0 space-y-2 border-t border-border px-4 py-4">
          <button
            type="button"
            disabled={logging}
            onClick={onAnonymous}
            className="flex w-full min-h-12 items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-card px-4 py-3 text-sm font-bold text-muted-foreground active:bg-secondary/40 disabled:opacity-50"
          >
            <Users className="size-4" />
            Anonymous / Team
          </button>
          <button
            type="button"
            disabled={logging}
            onClick={onCancel}
            className="w-full py-2 text-sm font-bold uppercase tracking-wide text-muted-foreground"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

export function StatTrackerScreen({ matchId, token }: StatTrackerScreenProps) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [teamName, setTeamName] = useState('')
  const [opponent, setOpponent] = useState('')
  const [homeScore, setHomeScore] = useState(0)
  const [awayScore, setAwayScore] = useState(0)
  const [clockSeconds, setClockSeconds] = useState(0)
  const [period, setPeriod] = useState<'1st' | '2nd'>('1st')
  const [matchStatus, setMatchStatus] = useState<'active' | 'scheduled' | 'pending_review' | 'completed'>('active')
  const [roster, setRoster] = useState<StatTrackerRosterPlayer[]>([])
  const [pendingAction, setPendingAction] = useState<StatTrackerEventType | null>(null)
  const [logging, setLogging] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [recentFeed, setRecentFeed] = useState<StatTrackerEventFeedItem[]>([])

  const rosterById = useMemo(
    () => new Map(roster.map((player) => [player.id, player])),
    [roster],
  )

  const pendingActionMeta = useMemo(
    () => STAT_TRACKER_ACTIONS.find((action) => action.eventType === pendingAction) ?? null,
    [pendingAction],
  )

  const refreshFeed = useCallback(async () => {
    const events = await fetchMatchEvents(matchId)
    setRecentFeed(buildStatTrackerFeed(events, rosterById).slice(0, 12))
  }, [matchId, rosterById])

  const loadContext = useCallback(async () => {
    const context = await fetchStatTrackerContext(matchId, token)
    if (!context) {
      throw new Error('Match not found for this stat tracker link.')
    }

    setTeamName(context.teamName)
    setOpponent(context.match.opponent)
    setHomeScore(context.match.home_score)
    setAwayScore(context.match.away_score)
    setClockSeconds(
      restoreMatchClockSeconds(
        context.match.clock_seconds,
        parseQualitativeContext(context.match.qualitative_context).addedTimeSeconds,
      ),
    )
    setPeriod(context.match.period)
    setMatchStatus(context.match.status)
    setRoster(context.roster)
  }, [matchId, token])

  useEffect(() => {
    let cancelled = false

    void (async () => {
      setLoading(true)
      setError(null)
      try {
        await loadContext()
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load stat tracker')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [loadContext])

  useEffect(() => {
    if (loading || error || roster.length === 0) return
    void refreshFeed().catch(() => {
      // Ignore initial feed load errors.
    })
  }, [error, loading, refreshFeed, roster.length])

  useEffect(() => {
    if (loading || error) return

    const intervalId = window.setInterval(() => {
      void fetchMatchById(matchId)
        .then((match) => {
          if (!match) return
          setHomeScore(match.home_score)
          setAwayScore(match.away_score)
          setClockSeconds(
            restoreMatchClockSeconds(
              match.clock_seconds,
              parseQualitativeContext(match.qualitative_context).addedTimeSeconds,
            ),
          )
          setPeriod(match.period)
          setMatchStatus(match.status)
        })
        .catch(() => {
          // Ignore transient polling errors on sideline devices.
        })

      void refreshFeed().catch(() => {
        // Ignore transient feed polling errors.
      })
    }, 5000)

    return () => window.clearInterval(intervalId)
  }, [error, loading, matchId, refreshFeed])

  useEffect(() => {
    if (!toast) return
    const id = window.setTimeout(() => setToast(null), 1800)
    return () => window.clearTimeout(id)
  }, [toast])

  const completeLog = async (playerId: string | null, anonymous: boolean) => {
    if (!pendingAction || logging || matchStatus !== 'active') return

    setLogging(true)
    try {
      await insertStatTrackerEvent({
        matchId,
        token,
        playerId,
        eventType: pendingAction,
        timestamp: clockSeconds,
        anonymous,
      })

      const label = statTrackerActionLabel(pendingAction)
      const player = playerId ? rosterById.get(playerId) : null
      const playerLabel = anonymous ? 'Team' : (player?.name ?? 'Player')
      setToast(`Logged ${label} · ${playerLabel}`)
      setPendingAction(null)
      await refreshFeed()
    } catch (err) {
      setToast(err instanceof Error ? err.message : 'Failed to log stat')
    } finally {
      setLogging(false)
    }
  }

  if (loading) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-background px-4">
        <p className="text-sm font-semibold text-muted-foreground">Loading stat tracker…</p>
      </main>
    )
  }

  if (error) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-background px-4">
        <div className="max-w-md rounded-xl border border-danger/40 bg-card p-6 text-center">
          <p className="font-bold text-danger">Stat tracker unavailable</p>
          <p className="mt-2 text-sm text-muted-foreground">{error}</p>
          <p className="mt-4 text-left text-xs text-muted-foreground">
            <span className="font-semibold text-foreground">Local debug:</span>
            <br />
            Match ID: {matchId}
            <br />
            Token length: {token.length} chars
            <br />
            URL: {window.location.href}
          </p>
          <p className="mt-4 text-xs text-muted-foreground">
            From the live match screen, tap <span className="font-semibold">Share Stat Tracker</span>{' '}
            again and open the newly copied link in this same browser session.
          </p>
        </div>
      </main>
    )
  }

  return (
    <main className={`${APP_SHELL} pb-8`}>
      <div className={`${APP_CONTAINER} space-y-4 pt-4`}>
        <header className="text-center">
          <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-athletic/10 px-3 py-1 text-xs font-bold uppercase tracking-widest text-athletic">
            <ClipboardList className="size-4" />
            Sideline Stat Tracker
          </div>
          <h1 className="font-display text-2xl font-black uppercase tracking-wide text-foreground">
            {teamName}
          </h1>
          <p className="mt-1 text-sm font-semibold text-muted-foreground">
            vs {opponent.trim() || 'Opponent'} · {period} half · {formatTrackerClock(clockSeconds)}
          </p>
          <p className="mt-2 font-display text-3xl font-black tabular-nums text-foreground">
            {homeScore} – {awayScore}
          </p>
          {matchStatus !== 'active' ? (
            <p className="mt-2 text-xs font-semibold text-danger">
              Match ended — stats can no longer be logged.
            </p>
          ) : (
            <p className="mt-2 text-xs text-muted-foreground">
              Tap an action, then tap the player. Built for rapid sideline logging.
            </p>
          )}
        </header>

        <RecentLogsTicker entries={recentFeed} />

        <section className="space-y-3">
          <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
            Log Action
          </h2>
          <div className="grid grid-cols-2 gap-3">
            {STAT_TRACKER_ACTIONS.map((action) => (
              <button
                key={action.eventType}
                type="button"
                disabled={logging || matchStatus !== 'active'}
                onClick={() => setPendingAction(action.eventType)}
                className={cn(
                  'flex min-h-[5.5rem] flex-col items-start justify-between rounded-2xl border px-4 py-4 text-left font-display shadow-lg transition-transform active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50',
                  actionToneClass(action.tone),
                )}
              >
                <span className="text-3xl leading-none">{action.icon}</span>
                <span className="mt-3 text-sm font-black uppercase leading-tight tracking-wide">
                  {action.label}
                </span>
              </button>
            ))}
          </div>
        </section>

        {recentFeed.length > 0 ? (
          <section className="rounded-xl border border-border bg-card p-3">
            <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              Latest Confirmations
            </p>
            <ul className="space-y-1.5">
              {recentFeed.slice(0, 6).map((entry) => (
                <li key={entry.id} className="text-sm text-foreground">
                  {formatStatTrackerFeedLine(entry)}
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>

      {pendingActionMeta ? (
        <PlayerAssignModal
          actionLabel={pendingActionMeta.label}
          actionIcon={pendingActionMeta.icon}
          roster={roster}
          logging={logging}
          onSelectPlayer={(playerId) => void completeLog(playerId, false)}
          onAnonymous={() => void completeLog(null, true)}
          onCancel={() => setPendingAction(null)}
        />
      ) : null}

      {toast ? (
        <div className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-4">
          <div className="flex items-center gap-2 rounded-full bg-neon px-4 py-2.5 text-sm font-bold text-neon-foreground shadow-lg">
            <CheckCircle2 className="size-5" strokeWidth={2.5} />
            {toast}
          </div>
        </div>
      ) : null}
    </main>
  )
}
