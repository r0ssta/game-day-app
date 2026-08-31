import type { VercelRequest, VercelResponse } from '@vercel/node'
import { corsPreflight, parseJsonBody, requireStaffSession } from '../_lib/auth'
import { requireMatchAccess } from '../_lib/match-access'
import { EndRegulationInputSchema } from '../_lib/match-action-schemas'
import { buildFullTimePush } from '../_lib/push-copy'
import { queueTeamWebPush } from '../_lib/send-web-push'
import { runMatchWrites } from '../_lib/match-writes'

const PERIOD_END_NOTE = 'period_end'

function persistableClockSeconds(clockSeconds: number): number {
  // Match client: store remaining regulation seconds (clamp OT remaining to 0).
  return Math.max(0, clockSeconds)
}

function addedTimeSeconds(clockSeconds: number): number {
  return clockSeconds < 0 ? Math.abs(clockSeconds) : 0
}

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

    const parsed = EndRegulationInputSchema.safeParse(parseJsonBody(req))
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

    const halfSeconds = Math.max(1, input.halfLengthMinutes) * 60
    const elapsed = halfSeconds - input.clockSeconds

    const writeResult = await runMatchWrites(auth.supabase, input.matchId, async (tx) => {
      for (const playerId of input.onFieldPlayerIds) {
        await tx.insertEvent({
          match_id: input.matchId,
          player_id: playerId,
          event_type: 'sub_out',
          timestamp: elapsed,
          formation: input.formation,
          event_notes: PERIOD_END_NOTE,
          is_pk: false,
        })
      }

      for (const playerId of input.onFieldPlayerIds) {
        await tx.updatePlayerStats(playerId, {
          match_status: 'bench',
          subbed_in_at: null,
        })
      }

      const { data: matchRow, error: contextError } = await auth.supabase
        .from('matches')
        .select('qualitative_context')
        .eq('id', input.matchId)
        .maybeSingle()
      if (contextError) throw contextError

      const prior =
        matchRow?.qualitative_context && typeof matchRow.qualitative_context === 'object'
          ? (matchRow.qualitative_context as Record<string, unknown>)
          : {}
      const nextContext = {
        ...prior,
        addedTimeSeconds: addedTimeSeconds(input.clockSeconds),
        endedOnTime: input.endedOnTime ?? null,
      }

      if (input.enterPenaltyShootout) {
        await tx.updateMatch({
          home_pk_score: 0,
          away_pk_score: 0,
          pk_winner_is_us: null,
          pk_gk_player_id: null,
          period_clock_started: false,
          clock_seconds: persistableClockSeconds(input.clockSeconds),
          qualitative_context: nextContext,
          status: 'live',
        })
        return { status: 'live' as const, enterPenaltyShootout: true }
      }

      await tx.updateMatch({
        status: 'pending_review',
        period_clock_started: false,
        clock_seconds: persistableClockSeconds(input.clockSeconds),
        qualitative_context: nextContext,
      })
      return { status: 'pending_review' as const, enterPenaltyShootout: false }
    })

    if (writeResult.enterPenaltyShootout) {
      return res.status(200).json({
        ok: true,
        status: writeResult.status,
        enterPenaltyShootout: true,
      })
    }

    if (
      input.sendFullTimePush &&
      !access.match.is_test &&
      input.homeScore != null &&
      input.awayScore != null &&
      input.teamName
    ) {
      const push = buildFullTimePush({
        teamName: input.teamName,
        opponent: input.opponent || access.match.opponent || 'Opponent',
        homeScore: input.homeScore,
        awayScore: input.awayScore,
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
      status: writeResult.status,
      enterPenaltyShootout: false,
    })
  } catch (err) {
    console.error('[api/match/end-regulation]', err)
    return res.status(500).json({
      ok: false,
      error: err instanceof Error ? err.message : 'Failed to end regulation',
    })
  }
}
