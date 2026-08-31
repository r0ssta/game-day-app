import type { VercelRequest, VercelResponse } from '@vercel/node'
import { corsPreflight, parseJsonBody, requireStaffSession } from '../_lib/auth'
import { requireMatchAccess } from '../_lib/match-access'
import { FinalizeReviewInputSchema } from '../_lib/match-action-schemas'
import { recomputePlusMinusFromEvents } from '../_lib/match-writes'

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

    await recomputePlusMinusFromEvents(auth.supabase, matchId)

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
