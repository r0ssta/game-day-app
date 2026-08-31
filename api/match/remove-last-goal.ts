import type { VercelRequest, VercelResponse } from '@vercel/node'
import { corsPreflight, parseJsonBody, requireStaffSession } from '../_lib/auth'
import { requireMatchAccess } from '../_lib/match-access'
import { RemoveLastGoalInputSchema } from '../_lib/match-action-schemas'
import {
  deleteMatchEventRow,
  findLastGoalEvent,
  findPairedGoalShotEvent,
  recomputePlusMinusFromEvents,
} from '../_lib/match-writes'

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

    const parsed = RemoveLastGoalInputSchema.safeParse(parseJsonBody(req))
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

    const { data: events, error: eventsError } = await auth.supabase
      .from('match_events')
      .select('id, event_type, timestamp')
      .eq('match_id', input.matchId)
      .order('created_at', { ascending: true })
    if (eventsError) throw eventsError

    const goalEvent = findLastGoalEvent(events ?? [], input.side)
    if (!goalEvent) {
      return res.status(409).json({
        ok: false,
        error: 'No goal to remove',
        code: 'no_goal',
      })
    }

    const pairedShot = findPairedGoalShotEvent(events ?? [], goalEvent)
    await deleteMatchEventRow(auth.supabase, goalEvent.id)
    if (pairedShot) {
      await deleteMatchEventRow(auth.supabase, pairedShot.id)
    }

    const homeScore =
      input.side === 'home' ? Math.max(0, access.match.home_score - 1) : access.match.home_score
    const awayScore =
      input.side === 'away' ? Math.max(0, access.match.away_score - 1) : access.match.away_score

    const { error: scoreError } = await auth.supabase
      .from('matches')
      .update({ home_score: homeScore, away_score: awayScore })
      .eq('id', input.matchId)
    if (scoreError) throw scoreError

    await recomputePlusMinusFromEvents(auth.supabase, input.matchId)

    return res.status(200).json({
      ok: true,
      homeScore,
      awayScore,
      removedPairedShot: Boolean(pairedShot),
      eventType: goalEvent.event_type,
    })
  } catch (err) {
    console.error('[api/match/remove-last-goal]', err)
    return res.status(500).json({
      ok: false,
      error: err instanceof Error ? err.message : 'Failed to remove goal',
    })
  }
}
