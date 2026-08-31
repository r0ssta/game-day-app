import type { VercelRequest, VercelResponse } from '@vercel/node'
import { corsPreflight, parseJsonBody, requireStaffSession } from '../auth.js'
import { requireMatchAccess } from '../match-access.js'
import { LogFormationInputSchema } from '../match-action-schemas.js'
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

    await runMatchWrites(auth.supabase, input.matchId, async (tx) => {
      if (input.kind === 'switch') {
        await tx.insertEvent({
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
        await tx.insertEvent({
          match_id: input.matchId,
          player_id: update.playerId,
          event_type: 'position_change',
          timestamp: input.timestamp,
          formation: input.formation,
          event_notes: update.position,
          is_pk: false,
        })
        await tx.updatePlayerStats(update.playerId, { match_position: update.position })
      }

      if (input.kind === 'switch') {
        for (const overflow of input.overflowPlayers) {
          await tx.insertEvent({
            match_id: input.matchId,
            player_id: overflow.playerId,
            event_type: 'sub_out',
            timestamp: input.timestamp,
            formation: input.formation,
            is_pk: false,
          })
          await tx.updatePlayerStats(overflow.playerId, {
            match_status: 'bench',
            subbed_in_at: null,
            total_seconds_played: overflow.totalSecondsPlayed,
            total_minutes: overflow.totalSecondsPlayed / 60,
          })
        }
      }
    })

    return res.status(200).json({ ok: true, kind: input.kind })
  } catch (err) {
    await reportApiError('[api/match/log-formation]', err)
    return res.status(500).json({
      ok: false,
      error: err instanceof Error ? err.message : 'Failed to log formation',
    })
  }
}
