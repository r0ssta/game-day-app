import type { SupabaseClient } from '@supabase/supabase-js'

export async function insertMatchEventRow(
  supabase: SupabaseClient,
  row: {
    match_id: string
    player_id: string | null
    event_type: string
    timestamp: number
    event_notes?: string | null
    formation?: string | null
    assist_player_id?: string | null
    is_pk?: boolean
    pk_result?: 'make' | 'miss' | null
    pk_team?: 'us' | 'opponent' | null
  },
): Promise<void> {
  const payload: Record<string, unknown> = {
    match_id: row.match_id,
    player_id: row.player_id,
    event_type: row.event_type,
    timestamp: row.timestamp,
    event_notes: row.event_notes ?? null,
    formation: row.formation ?? null,
    is_pk: row.is_pk === true,
  }
  if (row.event_type === 'goal') {
    payload.assist_player_id = row.assist_player_id ?? null
  }
  if (row.event_type === 'pk_attempt') {
    payload.pk_result = row.pk_result ?? null
    payload.pk_team = row.pk_team ?? null
  }

  const { error } = await supabase.from('match_events').insert(payload)
  if (error) throw error
}

export async function bumpOnFieldPlusMinus(
  supabase: SupabaseClient,
  matchId: string,
  onFieldPlayerIds: string[],
  delta: 1 | -1,
): Promise<void> {
  if (onFieldPlayerIds.length === 0) return

  const { data: stats, error } = await supabase
    .from('match_stats')
    .select('player_id, plus_minus')
    .eq('match_id', matchId)
    .in('player_id', onFieldPlayerIds)

  if (error) throw error

  await Promise.all(
    (stats ?? []).map(async (row) => {
      const next = (row.plus_minus ?? 0) + delta
      const { error: updateError } = await supabase
        .from('match_stats')
        .update({ plus_minus: next })
        .eq('match_id', matchId)
        .eq('player_id', row.player_id)
      if (updateError) {
        // Column may be missing on older DBs — don't fail the goal write.
        const message = updateError.message?.toLowerCase() ?? ''
        if (message.includes('plus_minus') && message.includes('column')) return
        throw updateError
      }
    }),
  )
}

export function teamEventType(
  kind: 'shot' | 'save' | 'corner',
  side: 'home' | 'away',
): string {
  return `${kind}_${side}`
}

export function pairedShotType(side: 'home' | 'away'): 'shot_home' | 'shot_away' {
  // A save by side X means the other side took a shot.
  return side === 'home' ? 'shot_away' : 'shot_home'
}

export function findLastGoalEvent<T extends { event_type: string }>(
  events: T[],
  side: 'home' | 'away',
): T | null {
  const eventType = side === 'home' ? 'goal' : 'opponent_goal'
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index]
    if (event.event_type === eventType) return event
  }
  return null
}

export function findPairedGoalShotEvent<
  T extends { event_type: string; timestamp: number },
>(events: T[], goalEvent: T): T | null {
  const shotType = goalEvent.event_type === 'goal' ? 'shot_home' : 'shot_away'
  return (
    events.find(
      (event) =>
        event.event_type === shotType && event.timestamp === goalEvent.timestamp,
    ) ?? null
  )
}

export async function deleteMatchEventRow(
  supabase: SupabaseClient,
  eventId: string,
): Promise<void> {
  const { error } = await supabase.from('match_events').delete().eq('id', eventId)
  if (error) throw error
}

/**
 * Rebuild plus/minus from the event timeline (same rules as live goal logging).
 * Missing plus_minus column is tolerated for older DBs.
 */
export async function recomputePlusMinusFromEvents(
  supabase: SupabaseClient,
  matchId: string,
): Promise<void> {
  const [{ data: events, error: eventsError }, { data: stats, error: statsError }] =
    await Promise.all([
      supabase
        .from('match_events')
        .select('event_type, player_id')
        .eq('match_id', matchId)
        .order('created_at', { ascending: true }),
      supabase
        .from('match_stats')
        .select('player_id, attending, is_first_half_starter')
        .eq('match_id', matchId),
    ])
  if (eventsError) throw eventsError
  if (statsError) throw statsError

  const firstHalfStarterIds = new Set(
    (stats ?? [])
      .filter((row) => row.is_first_half_starter)
      .map((row) => row.player_id as string),
  )
  const onField = new Set<string>()
  const ledger = new Map<string, number>()
  let sawSub = false

  for (const event of events ?? []) {
    const type = event.event_type as string
    const playerId = event.player_id as string | null
    if (type === 'sub_in' && playerId) {
      sawSub = true
      onField.add(playerId)
    } else if (type === 'sub_out' && playerId) {
      sawSub = true
      onField.delete(playerId)
    } else if (type === 'goal' || type === 'opponent_goal') {
      if (!sawSub && onField.size === 0) {
        for (const id of firstHalfStarterIds) onField.add(id)
      }
      const delta = type === 'goal' ? 1 : -1
      for (const id of onField) {
        ledger.set(id, (ledger.get(id) ?? 0) + delta)
      }
    }
  }

  for (const row of stats ?? []) {
    if (!row.attending) continue
    const playerId = row.player_id as string
    const plusMinus = ledger.get(playerId) ?? 0
    const { error: updateError } = await supabase
      .from('match_stats')
      .update({ plus_minus: plusMinus })
      .eq('match_id', matchId)
      .eq('player_id', playerId)
    if (updateError) {
      const message = updateError.message?.toLowerCase() ?? ''
      if (message.includes('plus_minus') && message.includes('column')) continue
      throw updateError
    }
  }
}
