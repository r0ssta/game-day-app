import type { SupabaseClient } from '@supabase/supabase-js'
import { invalidateMatchAccessCache } from './match-access.js'
import { reportApiError } from './sentry.js'

export type MatchEventInsert = {
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
}

const EVENT_RESTORE_COLUMNS =
  'id, match_id, player_id, event_type, timestamp, event_notes, formation, assist_player_id, is_pk, pk_result, pk_team'

function isMissingPlusMinusColumn(error: { message?: string }): boolean {
  const message = error.message?.toLowerCase() ?? ''
  return message.includes('plus_minus') && message.includes('column')
}

export function matchEventInsertPayload(row: MatchEventInsert): Record<string, unknown> {
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
  return payload
}

/**
 * Tracks match_events / matches / match_stats writes and restores them if a
 * later step throws. Not a Postgres transaction — a process crash can still
 * leave a partial write — but an exception no longer commits half a goal.
 */
export class MatchWriteSession {
  private insertedEventIds: string[] = []
  private deletedEventRows: Record<string, unknown>[] = []
  private matchRevert: Record<string, unknown> | null = null
  private statsReverts: Array<{ playerId: string; patch: Record<string, unknown> }> = []

  constructor(
    private readonly supabase: SupabaseClient,
    readonly matchId: string,
  ) {}

  async insertEvents(rows: MatchEventInsert[]): Promise<string[]> {
    if (rows.length === 0) return []
    const payloads = rows.map(matchEventInsertPayload)
    const { data, error } = await this.supabase
      .from('match_events')
      .insert(payloads)
      .select('id')
    if (error) throw error
    const ids = (data ?? []).map((row) => row.id as string)
    this.insertedEventIds.push(...ids)
    return ids
  }

  async insertEvent(row: MatchEventInsert): Promise<string> {
    const ids = await this.insertEvents([row])
    const id = ids[0]
    if (!id) throw new Error('Event insert returned no id')
    return id
  }

  async deleteEvents(eventIds: string[]): Promise<void> {
    const ids = eventIds.filter(Boolean)
    if (ids.length === 0) return
    const { data, error } = await this.supabase
      .from('match_events')
      .select(EVENT_RESTORE_COLUMNS)
      .in('id', ids)
    if (error) throw error
    this.deletedEventRows.push(...((data ?? []) as Record<string, unknown>[]))
    const { error: deleteError } = await this.supabase
      .from('match_events')
      .delete()
      .in('id', ids)
    if (deleteError) throw deleteError
  }

  async updateMatch(patch: Record<string, unknown>): Promise<void> {
    const keys = Object.keys(patch)
    if (keys.length === 0) return
    const missing = keys.filter((key) => !this.matchRevert || !(key in this.matchRevert))
    if (missing.length > 0) {
      const { data, error } = await this.supabase
        .from('matches')
        .select(missing.join(','))
        .eq('id', this.matchId)
        .maybeSingle()
      if (error) throw error
      if (!this.matchRevert) this.matchRevert = {}
      for (const key of missing) {
        this.matchRevert[key] = data ? (data as Record<string, unknown>)[key] : null
      }
    }
    const { error } = await this.supabase.from('matches').update(patch).eq('id', this.matchId)
    if (error) throw error
    invalidateMatchAccessCache(this.matchId)
  }

  async updatePlayerStats(playerId: string, patch: Record<string, unknown>): Promise<void> {
    const keys = Object.keys(patch)
    if (keys.length === 0) return
    const { data, error } = await this.supabase
      .from('match_stats')
      .select(keys.join(','))
      .eq('match_id', this.matchId)
      .eq('player_id', playerId)
      .maybeSingle()
    if (error) {
      if (isMissingPlusMinusColumn(error) && keys.length === 1 && keys[0] === 'plus_minus') {
        return
      }
      throw error
    }
    if (data) {
      const revert: Record<string, unknown> = {}
      for (const key of keys) {
        revert[key] = (data as Record<string, unknown>)[key]
      }
      this.statsReverts.push({ playerId, patch: revert })
    }
    const { error: updateError } = await this.supabase
      .from('match_stats')
      .update(patch)
      .eq('match_id', this.matchId)
      .eq('player_id', playerId)
    if (updateError) {
      if (isMissingPlusMinusColumn(updateError) && keys.length === 1 && keys[0] === 'plus_minus') {
        return
      }
      throw updateError
    }
  }

  async bumpOnFieldPlusMinus(onFieldPlayerIds: string[], delta: 1 | -1): Promise<void> {
    if (onFieldPlayerIds.length === 0) return
    const { data: stats, error } = await this.supabase
      .from('match_stats')
      .select('player_id, plus_minus')
      .eq('match_id', this.matchId)
      .in('player_id', onFieldPlayerIds)
    if (error) {
      if (isMissingPlusMinusColumn(error)) return
      throw error
    }
    await Promise.all(
      (stats ?? []).map(async (row) => {
        const playerId = row.player_id as string
        const previous = (row.plus_minus as number | null) ?? 0
        this.statsReverts.push({ playerId, patch: { plus_minus: previous } })
        const { error: updateError } = await this.supabase
          .from('match_stats')
          .update({ plus_minus: previous + delta })
          .eq('match_id', this.matchId)
          .eq('player_id', playerId)
        if (updateError) {
          if (isMissingPlusMinusColumn(updateError)) return
          throw updateError
        }
      }),
    )
  }

  async rollback(): Promise<void> {
    const errors: unknown[] = []
    if (this.insertedEventIds.length > 0) {
      const { error } = await this.supabase
        .from('match_events')
        .delete()
        .in('id', this.insertedEventIds)
      if (error) errors.push(error)
    }
    if (this.deletedEventRows.length > 0) {
      const { error } = await this.supabase.from('match_events').insert(this.deletedEventRows)
      if (error) errors.push(error)
    }
    if (this.matchRevert) {
      const { error } = await this.supabase
        .from('matches')
        .update(this.matchRevert)
        .eq('id', this.matchId)
      if (error) errors.push(error)
      invalidateMatchAccessCache(this.matchId)
    }
    for (const revert of this.statsReverts) {
      const { error } = await this.supabase
        .from('match_stats')
        .update(revert.patch)
        .eq('match_id', this.matchId)
        .eq('player_id', revert.playerId)
      if (error && !isMissingPlusMinusColumn(error)) errors.push(error)
    }
    if (errors.length > 0) {
      await reportApiError(
        '[match-writes] rollback incomplete',
        new Error('Match write rollback incomplete'),
        {
          matchId: this.matchId,
          errors: errors.map((item) =>
            item instanceof Error ? item.message : String(item),
          ),
        },
      )
    }
  }
}

export async function runMatchWrites<T>(
  supabase: SupabaseClient,
  matchId: string,
  work: (session: MatchWriteSession) => Promise<T>,
): Promise<T> {
  const session = new MatchWriteSession(supabase, matchId)
  try {
    return await work(session)
  } catch (err) {
    try {
      await session.rollback()
    } catch (rollbackErr) {
      await reportApiError('[match-writes] rollback failed', rollbackErr, {
        matchId,
      })
    }
    throw err
  }
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

/**
 * Rebuild plus/minus from the event timeline (same rules as live goal logging).
 * Missing plus_minus column is tolerated for older DBs.
 */
export async function recomputePlusMinusFromEvents(
  supabase: SupabaseClient,
  matchId: string,
  session?: MatchWriteSession,
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
    if (session) {
      await session.updatePlayerStats(playerId, { plus_minus: plusMinus })
      continue
    }
    const { error: updateError } = await supabase
      .from('match_stats')
      .update({ plus_minus: plusMinus })
      .eq('match_id', matchId)
      .eq('player_id', playerId)
    if (updateError) {
      if (isMissingPlusMinusColumn(updateError)) continue
      throw updateError
    }
  }
}
