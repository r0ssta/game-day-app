import type { VercelRequest, VercelResponse } from '@vercel/node'
import { corsPreflight, parseJsonBody, requireStaffSession } from '../auth.js'
import { requireMatchAccess } from '../match-access.js'
import { isOwnGoalType, UpdateGoalInputSchema } from '../match-action-schemas.js'
import { reportApiError } from '../sentry.js'
import { runMatchWrites } from '../match-writes.js'

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

    const parsed = UpdateGoalInputSchema.safeParse(parseJsonBody(req))
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

    const { data: goalEvent, error: lookupError } = await auth.supabase
      .from('match_events')
      .select('id, event_type, event_notes, player_id, assist_player_id')
      .eq('match_id', input.matchId)
      .eq('id', input.eventId)
      .maybeSingle()
    if (lookupError) throw lookupError

    if (!goalEvent) {
      return res.status(404).json({
        ok: false,
        error: 'Goal not found',
        code: 'goal_not_found',
      })
    }

    if (goalEvent.event_type !== 'goal') {
      return res.status(409).json({
        ok: false,
        error: 'Only our goals can change scorer or assist',
        code: 'not_editable',
      })
    }

    if (isOwnGoalType(goalEvent.event_notes as string | null)) {
      return res.status(409).json({
        ok: false,
        error: 'Own goals cannot change scorer or assist',
        code: 'not_editable',
      })
    }

    const nextScorerId = input.scorerId
    const nextAssistId =
      nextScorerId && input.assistPlayerId === nextScorerId ? null : input.assistPlayerId

    await runMatchWrites(auth.supabase, input.matchId, async (tx) => {
      await tx.updateEvent(input.eventId, {
        player_id: nextScorerId,
        assist_player_id: nextAssistId,
      })
    })

    return res.status(200).json({
      ok: true,
      eventId: input.eventId,
      scorerId: nextScorerId,
      assistPlayerId: nextAssistId,
    })
  } catch (err) {
    await reportApiError('[api/match/update-goal]', err)
    return res.status(500).json({
      ok: false,
      error: err instanceof Error ? err.message : 'Failed to update goal',
    })
  }
}
