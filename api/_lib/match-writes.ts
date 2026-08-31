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
