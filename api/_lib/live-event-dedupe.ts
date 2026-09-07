import type { SupabaseClient } from '@supabase/supabase-js'

export const SERVER_LIVE_EVENT_DEDUPE_SECONDS = 3

export async function isDuplicateLiveEvent(
  supabase: SupabaseClient,
  input: {
    matchId: string
    eventType: string
    playerId?: string | null
    isPk?: boolean
    eventNotes?: string | null
    windowSeconds?: number
  },
): Promise<boolean> {
  const { data, error } = await supabase.rpc('live_event_is_duplicate', {
    p_match_id: input.matchId,
    p_event_type: input.eventType,
    p_player_id: input.playerId ?? null,
    p_is_pk: input.isPk === true,
    p_event_notes: input.eventNotes ?? null,
    p_window_seconds: input.windowSeconds ?? SERVER_LIVE_EVENT_DEDUPE_SECONDS,
  })
  if (error) throw error
  return data === true
}
