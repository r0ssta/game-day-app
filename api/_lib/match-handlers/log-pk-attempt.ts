import type { VercelRequest, VercelResponse } from '@vercel/node'
import { corsPreflight, parseJsonBody, requireStaffSession } from '../auth.js'
import { requireMatchAccess } from '../match-access.js'
import { LogPkAttemptInputSchema } from '../match-action-schemas.js'
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

    const parsed = LogPkAttemptInputSchema.safeParse(parseJsonBody(req))
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

    const nextHome =
      input.team === 'us' && input.result === 'make'
        ? input.homePkScoreBefore + 1
        : input.homePkScoreBefore
    const nextAway =
      input.team === 'opponent' && input.result === 'make'
        ? input.awayPkScoreBefore + 1
        : input.awayPkScoreBefore

    await runMatchWrites(auth.supabase, input.matchId, async (tx) => {
      await tx.insertEvent({
        match_id: input.matchId,
        player_id: input.playerId ?? null,
        event_type: 'pk_attempt',
        timestamp: input.round,
        formation: input.formation,
        event_notes: JSON.stringify({
          result: input.result,
          team: input.team,
          round: input.round,
        }),
        is_pk: false,
        pk_result: input.result,
        pk_team: input.team,
      })
      await tx.updateMatch({ home_pk_score: nextHome, away_pk_score: nextAway })
    })

    return res.status(200).json({
      ok: true,
      homePkScore: nextHome,
      awayPkScore: nextAway,
    })
  } catch (err) {
    await reportApiError('[api/match/log-pk-attempt]', err)
    return res.status(500).json({
      ok: false,
      error: err instanceof Error ? err.message : 'Failed to log PK attempt',
    })
  }
}
