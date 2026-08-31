import type { VercelRequest, VercelResponse } from '@vercel/node'
import { corsPreflight, parseJsonBody, requireStaffSession } from '../_lib/auth'
import { requireMatchAccess } from '../_lib/match-access'
import { FinalizeReviewInputSchema } from '../_lib/match-action-schemas'

/**
 * Port of client `finalizeMatchReview`: recompute plus/minus from events, set status final.
 */
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

    const parsed = FinalizeReviewInputSchema.safeParse(parseJsonBody(req))
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        error: 'Invalid payload',
        code: 'validation_error',
        details: parsed.error.flatten(),
      })
    }

    const { matchId } = parsed.data
    const access = await requireMatchAccess(auth.supabase, matchId)
    if ('error' in access) {
      return res.status(access.status).json({ ok: false, error: access.error })
    }

    const [{ data: match }, { data: events, error: eventsError }, { data: stats, error: statsError }] =
      await Promise.all([
        auth.supabase
          .from('matches')
          .select('half_length')
          .eq('id', matchId)
          .maybeSingle(),
        auth.supabase
          .from('match_events')
          .select('*')
          .eq('match_id', matchId)
          .order('created_at', { ascending: true }),
        auth.supabase.from('match_stats').select('*').eq('match_id', matchId),
      ])

    if (eventsError) throw eventsError
    if (statsError) throw statsError
    if (!match) {
      return res.status(404).json({ ok: false, error: 'Match not found' })
    }

    // Lightweight plus/minus: +1/-1 for on-field players at each goal using event timeline.
    // Mirrors client computeMatchPlusMinus without importing Vite-aliased modules.
    const halfLengthSeconds = Math.max(1, match.half_length ?? 30) * 60
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
      // Reset field between halves: period_end sub_outs already clear onField.
      void halfLengthSeconds
    }

    for (const row of stats ?? []) {
      if (!row.attending) continue
      const playerId = row.player_id as string
      const plusMinus = ledger.get(playerId) ?? 0
      const { error: updateError } = await auth.supabase
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

    const { error: finalError } = await auth.supabase
      .from('matches')
      .update({ status: 'final' })
      .eq('id', matchId)
    if (finalError) throw finalError

    return res.status(200).json({ ok: true, status: 'final' })
  } catch (err) {
    console.error('[api/match/finalize-review]', err)
    return res.status(500).json({
      ok: false,
      error: err instanceof Error ? err.message : 'Failed to finalize review',
    })
  }
}
