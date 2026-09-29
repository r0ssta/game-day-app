import type { VercelRequest, VercelResponse } from '@vercel/node'
import { corsPreflight, parseJsonBody, requireStaffSession } from '../auth.js'
import { requireMatchAccess } from '../match-access.js'
import { LogAvailabilityInputSchema } from '../match-action-schemas.js'
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

    const parsed = LogAvailabilityInputSchema.safeParse(parseJsonBody(req))
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

    const { data: stat, error: statError } = await auth.supabase
      .from('match_stats')
      .select('player_id, is_sent_off')
      .eq('match_id', input.matchId)
      .eq('player_id', input.playerId)
      .maybeSingle()

    if (statError) throw statError
    if (!stat) {
      return res.status(404).json({ ok: false, error: 'Player is not on this match' })
    }

    if (stat.is_sent_off) {
      return res.status(409).json({
        ok: false,
        error: 'Sent-off players stay out for the rest of the match',
      })
    }

    const reason = input.attending ? null : (input.reason ?? null)
    const patch: Record<string, unknown> = {
      attending: input.attending,
      match_status: input.attending ? 'bench' : 'absent',
      subbed_in_at: null,
      absence_reason: reason,
    }
    if (!input.attending && typeof input.totalSecondsPlayed === 'number') {
      patch.total_seconds_played = input.totalSecondsPlayed
      patch.total_minutes = input.totalSecondsPlayed / 60
    }
    await runMatchWrites(auth.supabase, input.matchId, async (tx) => {
      await tx.updatePlayerStats(input.playerId, patch)
    })

    return res.status(200).json({ ok: true, attending: input.attending })
  } catch (err) {
    await reportApiError('[api/match/log-availability]', err)
    return res.status(500).json({
      ok: false,
      error: err instanceof Error ? err.message : 'Failed to update availability',
    })
  }
}
