import { useEffect, useRef } from 'react'
import { isMatchClockHeartbeatUpdate } from '@/lib/live-match-snapshot'
import { supabase } from '@/supabaseClient'

const POLL_MS = 5_000
/** Realtime is the fast path. This still reconciles a missed event. */
const HEALTHY_POLL_MS = 15_000
const DEBOUNCE_MS = 250

type MatchChangeRow = Record<string, unknown>

/**
 * Keep a staff live-match screen in sync with another coach on the same match.
 * Realtime is the fast path. A slower poll keeps running after subscribe so a
 * missed change still lands.
 *
 * `matches` UPDATEs that only move `clock_seconds` are ignored so the local
 * countdown does not rewind. Other changes hydrate the shared match: scores,
 * and — once the period clock is running — lineup and playing time. Callers
 * must not restart the clock from that path.
 */
export function useLiveMatchSync(input: {
  matchId: string | null
  enabled: boolean
  isBlocked: () => boolean
  onHydrate: () => Promise<unknown>
}) {
  const isBlockedRef = useRef(input.isBlocked)
  const onHydrateRef = useRef(input.onHydrate)
  isBlockedRef.current = input.isBlocked
  onHydrateRef.current = input.onHydrate

  useEffect(() => {
    if (!input.enabled || !input.matchId) return

    const matchId = input.matchId
    let cancelled = false
    let debounceId = 0

    const hydrate = () => {
      if (cancelled || isBlockedRef.current()) return
      // Channel / fetch identity: ['match', matchId, 'events']
      void onHydrateRef.current()
    }

    const schedule = () => {
      window.clearTimeout(debounceId)
      debounceId = window.setTimeout(hydrate, DEBOUNCE_MS)
    }

    const onMatchChange = (payload: { new: MatchChangeRow; old: MatchChangeRow }) => {
      if (isMatchClockHeartbeatUpdate(payload.new, payload.old)) return
      schedule()
    }

    hydrate()
    let pollId = 0
    let pollEvery = 0
    const stopPoll = () => {
      if (!pollId) return
      window.clearInterval(pollId)
      pollId = 0
      pollEvery = 0
    }
    const startPoll = (every: number) => {
      if (pollId && pollEvery === every) return
      stopPoll()
      pollEvery = every
      pollId = window.setInterval(hydrate, every)
    }
    startPoll(POLL_MS)

    const channel = supabase
      .channel(`staff-live-${matchId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'matches',
          filter: `id=eq.${matchId}`,
        },
        onMatchChange,
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'match_events',
          filter: `match_id=eq.${matchId}`,
        },
        schedule,
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'match_stats',
          filter: `match_id=eq.${matchId}`,
        },
        schedule,
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') startPoll(HEALTHY_POLL_MS)
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          startPoll(POLL_MS)
        }
      })

    return () => {
      cancelled = true
      window.clearTimeout(debounceId)
      stopPoll()
      void supabase.removeChannel(channel)
    }
  }, [input.enabled, input.matchId])
}
