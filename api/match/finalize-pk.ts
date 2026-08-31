import type { VercelRequest, VercelResponse } from '@vercel/node'
import { corsPreflight, parseJsonBody, requireStaffSession } from '../_lib/auth'
import { requireMatchAccess } from '../_lib/match-access'
import { FinalizePkInputSchema } from '../_lib/match-action-schemas'
import { reportApiError } from '../_lib/sentry'
import { buildFullTimePush } from '../_lib/push-copy'
import { queueTeamWebPush } from '../_lib/send-web-push'
import { runMatchWrites } from '../_lib/match-writes'

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

    const parsed = FinalizePkInputSchema.safeParse(parseJsonBody(req))
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
      await tx.updateMatch({
        home_pk_score: input.homePkScore,
        away_pk_score: input.awayPkScore,
        pk_winner_is_us: input.pkWinnerIsUs,
        period_clock_started: false,
        status: 'pending_review',
      })
    })

    if (!access.match.is_test) {
      const pkNote = `PKs ${input.homePkScore}–${input.awayPkScore} (${input.pkWinnerIsUs ? 'W' : 'L'})`
      const push = buildFullTimePush({
        teamName: input.teamName.trim() || 'Home',
        opponent: input.opponent,
        homeScore: input.homeScore,
        awayScore: input.awayScore,
        pkNote,
      })
      const hubPath = input.teamSlug
        ? `/hub/${encodeURIComponent(input.teamSlug)}`
        : '/'
      queueTeamWebPush(auth.supabase, {
        teamId: access.match.team_id,
        title: push.title,
        body: push.body,
        url: hubPath,
        tag: `vvfc-ft-${input.matchId}`,
        eventType: 'full_time',
      })
    }

    return res.status(200).json({
      ok: true,
      status: 'pending_review',
      pkWinnerIsUs: input.pkWinnerIsUs,
    })
  } catch (err) {
    await reportApiError('[api/match/finalize-pk]', err)
    return res.status(500).json({
      ok: false,
      error: err instanceof Error ? err.message : 'Failed to finalize shootout',
    })
  }
}
