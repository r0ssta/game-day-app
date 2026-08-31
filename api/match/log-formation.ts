import type { VercelRequest, VercelResponse } from '@vercel/node'
import type { SupabaseClient } from '@supabase/supabase-js'
import { corsPreflight, parseJsonBody, requireStaffSession } from '../_lib/auth'
import { requireMatchAccess } from '../_lib/match-access'
import { LogFormationInputSchema } from '../_lib/match-action-schemas'
import { insertMatchEventRow } from '../_lib/match-writes'

async function updateMatchPosition(
  supabase: SupabaseClient,
  matchId: string,
  playerId: string,
  position: string,
) {
  const { error } = await supabase
    .from('match_stats')
    .update({ match_position: position })
    .eq('match_id', matchId)
    .eq('player_id', playerId)
  if (error) {
    console.warn('[log-formation] match_position', error.message)
  }
}

async function benchOverflowPlayer(
  supabase: SupabaseClient,
  matchId: string,
  playerId: string,
  totalSecondsPlayed: number,
) {
  const { error } = await supabase
    .from('match_stats')
    .update({
      match_status: 'bench',
      subbed_in_at: null,
      total_seconds_played: totalSecondsPlayed,
      total_minutes: totalSecondsPlayed / 60,
    })
    .eq('match_id', matchId)
    .eq('player_id', playerId)
  if (error) {
    console.warn('[log-formation] overflow stats', error.message)
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') {
    corsPreflight(res)
    return res.status(200).end()
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' })
  }
  corsPreflight(res)

  try {
    const auth = await requireStaffSession(req)
    if ('error' in auth) {
      return res.status(auth.status).json({ ok: false, error: auth.error })
    }

    const parsed = LogFormationInputSchema.safeParse(parseJsonBody(req))
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        error: 'Invalid payload',
        code: 'validation_error',
        details: parsed.error.flatten(),
      })
    }

    const input = parsed.data
    const access = await requireMatchAccess(auth.supabase, input.matchId)
    if ('error' in access) {
      return res.status(access.status).json({ ok: false, error: access.error })
    }

    if (input.kind === 'switch') {
      await insertMatchEventRow(auth.supabase, {
        match_id: input.matchId,
        player_id: null,
        event_type: 'formation_change',
        timestamp: input.timestamp,
        formation: input.formation,
        event_notes: `${input.previousLabel} → ${input.nextLabel}`,
        is_pk: false,
      })
    }

    for (const update of input.positionUpdates) {
      await insertMatchEventRow(auth.supabase, {
        match_id: input.matchId,
        player_id: update.playerId,
        event_type: 'position_change',
        timestamp: input.timestamp,
        formation: input.formation,
        event_notes: update.position,
        is_pk: false,
      })
      await updateMatchPosition(
        auth.supabase,
        input.matchId,
        update.playerId,
        update.position,
      )
    }

    if (input.kind === 'switch') {
      for (const overflow of input.overflowPlayers) {
        await insertMatchEventRow(auth.supabase, {
          match_id: input.matchId,
          player_id: overflow.playerId,
          event_type: 'sub_out',
          timestamp: input.timestamp,
          formation: input.formation,
          is_pk: false,
        })
        await benchOverflowPlayer(
          auth.supabase,
          input.matchId,
          overflow.playerId,
          overflow.totalSecondsPlayed,
        )
      }
    }

    return res.status(200).json({ ok: true, kind: input.kind })
  } catch (err) {
    console.error('[api/match/log-formation]', err)
    return res.status(500).json({
      ok: false,
      error: err instanceof Error ? err.message : 'Failed to log formation',
    })
  }
}
