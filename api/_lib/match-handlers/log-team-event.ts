import type { VercelRequest, VercelResponse } from '@vercel/node'
import { corsPreflight, parseJsonBody, requireStaffSession } from '../auth.js'
import { requireMatchAccess } from '../match-access.js'
import { LogTeamEventInputSchema } from '../match-action-schemas.js'
import { reportApiError } from '../sentry.js'
import {
  type MatchEventInsert,
  pairedShotType,
  runMatchWrites,
  teamEventType,
} from '../match-writes.js'

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

    const parsed = LogTeamEventInputSchema.safeParse(parseJsonBody(req))
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

    const eventType = teamEventType(input.eventKind, input.side)
    const playerId =
      input.eventKind === 'save' && input.side === 'home'
        ? (input.playerId ?? null)
        : null
    const pairAutoShot = input.eventKind === 'save' && input.pairAutoShot

    await runMatchWrites(auth.supabase, input.matchId, async (tx) => {
      const rows: MatchEventInsert[] = [
        {
          match_id: input.matchId,
          player_id: playerId,
          event_type: eventType,
          timestamp: input.timestamp,
          formation: input.formation,
          is_pk: false,
        },
      ]
      if (pairAutoShot) {
        rows.push({
          match_id: input.matchId,
          player_id: null,
          event_type: pairedShotType(input.side),
          timestamp: input.timestamp,
          formation: input.formation,
          is_pk: false,
        })
      }
      await tx.insertEvents(rows)
    })

    return res.status(200).json({
      ok: true,
      eventType,
      pairedShot: input.eventKind === 'save' && input.pairAutoShot,
    })
  } catch (err) {
    await reportApiError('[api/match/log-team-event]', err)
    return res.status(500).json({
      ok: false,
      error: err instanceof Error ? err.message : 'Failed to log event',
    })
  }
}
