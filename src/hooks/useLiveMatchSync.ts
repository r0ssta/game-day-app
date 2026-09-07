import { useEffect, useRef } from 'react'
import { isMatchClockHeartbeatUpdate } from '@/lib/live-match-snapshot'
import { supabase } from '@/supabaseClient'

const POLL_MS = 5_000
const DEBOUNCE_MS = 250

type MatchChangeRow = Record<string, unknown>

/**
 * Keep a staff live-match screen in sync with another coach on the same match.
 * Realtime is the fast path; polling covers missed events.
 *
 * `matches` UPDATEs that only move `clock_seconds` are ignored so the local
 * countdown does not rewind. Score / event / stats changes hydrate a
 * non-destructive scores slice — callers must not close modals or replace
 * the pitch lineup from that path.
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
    const pollId = window.setInterval(hydrate, POLL_MS)

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
      .subscribe()

    return () => {
      cancelled = true
      window.clearTimeout(debounceId)
      window.clearInterval(pollId)
      void supabase.removeChannel(channel)
    }
  }, [input.enabled, input.matchId])
}
