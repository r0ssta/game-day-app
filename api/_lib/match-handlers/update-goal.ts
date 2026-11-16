import type { VercelRequest, VercelResponse } from '@vercel/node'
import { corsPreflight, parseJsonBody, requireStaffSession } from '../auth.js'
import { requireMatchAccess } from '../match-access.js'
import { isOwnGoalType, UpdateGoalInputSchema } from '../match-action-schemas.js'
import { reportApiError } from '../sentry.js'
import { findPairedGoalShotEvent, runMatchWrites } from '../match-writes.js'

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

    const { data: events, error: lookupError } = await auth.supabase
      .from('match_events')
      .select('id, event_type, event_notes, player_id, assist_player_id, timestamp')
      .eq('match_id', input.matchId)
      .order('created_at', { ascending: true })
    if (lookupError) throw lookupError

    const goalEvent = (events ?? []).find((event) => event.id === input.eventId)
    if (
      !goalEvent ||
      (goalEvent.event_type !== 'goal' && goalEvent.event_type !== 'opponent_goal')
    ) {
      return res.status(404).json({
        ok: false,
        error: 'Goal not found',
        code: 'goal_not_found',
      })
    }

    const wantsCredits =
      input.scorerId !== undefined || input.assistPlayerId !== undefined
    const wantsTimestamp = input.timestamp !== undefined
    const ownGoal = isOwnGoalType(goalEvent.event_notes as string | null)

    if (wantsCredits) {
      if (goalEvent.event_type !== 'goal' || ownGoal) {
        return res.status(409).json({
          ok: false,
          error: 'Only our goals can change scorer or assist',
          code: 'not_editable',
        })
      }
    }

    const nextScorerId =
      input.scorerId !== undefined ? input.scorerId : (goalEvent.player_id as string | null)
    const requestedAssist =
      input.assistPlayerId !== undefined
        ? input.assistPlayerId
        : (goalEvent.assist_player_id as string | null)
    const nextAssistId =
      wantsCredits && nextScorerId && requestedAssist === nextScorerId
        ? null
        : requestedAssist
    const nextTimestamp =
      input.timestamp !== undefined ? input.timestamp : (goalEvent.timestamp as number)

    const pairedShot =
      wantsTimestamp && nextTimestamp !== goalEvent.timestamp
        ? findPairedGoalShotEvent(events ?? [], goalEvent)
        : null

    await runMatchWrites(auth.supabase, input.matchId, async (tx) => {
      const patch: Record<string, unknown> = {}
      if (wantsCredits) {
        patch.player_id = nextScorerId
        patch.assist_player_id = nextAssistId
      }
      if (wantsTimestamp) {
        patch.timestamp = nextTimestamp
      }
      await tx.updateEvent(input.eventId, patch)
      if (pairedShot?.id) {
        await tx.updateEvent(pairedShot.id, { timestamp: nextTimestamp })
      }
    })

    return res.status(200).json({
      ok: true,
      eventId: input.eventId,
      scorerId: wantsCredits ? nextScorerId : (goalEvent.player_id as string | null),
      assistPlayerId: wantsCredits ? nextAssistId : (goalEvent.assist_player_id as string | null),
      timestamp: nextTimestamp,
      updatedPairedShot: Boolean(pairedShot),
    })
  } catch (err) {
    await reportApiError('[api/match/update-goal]', err)
    return res.status(500).json({
      ok: false,
      error: err instanceof Error ? err.message : 'Failed to update goal',
    })
  }
}
