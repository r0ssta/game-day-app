import { useEffect, useRef } from 'react'
import { supabase } from '@/supabaseClient'

const POLL_MS = 5_000
const DEBOUNCE_MS = 250

/**
 * Keep a staff live-match screen in sync with another coach on the same match.
 * Realtime is the fast path; polling covers missed events and tables that are
 * not in the publication yet.
 *
 * Intentionally does not subscribe to `matches` UPDATEs — the local clock
 * heartbeat writes that table every 5s and a full hydrate from those echoes
 * was snapping the countdown backward and stalling live actions.
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

    hydrate()
    const pollId = window.setInterval(hydrate, POLL_MS)

    const channel = supabase
      .channel(`staff-live-${matchId}`)
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
