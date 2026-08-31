import type { VercelRequest, VercelResponse } from '@vercel/node'
import { corsPreflight, parseJsonBody, requireStaffSession } from '../_lib/auth'
import { requireMatchAccess } from '../_lib/match-access'
import { LogSubstitutionInputSchema } from '../_lib/match-action-schemas'
import { buildSubstitutionPush } from '../_lib/push-copy'
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

    const parsed = LogSubstitutionInputSchema.safeParse(parseJsonBody(req))
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

    const doOut = input.kind === 'out' || input.kind === 'swap'
    const doIn = input.kind === 'in' || input.kind === 'swap'

    await runMatchWrites(auth.supabase, input.matchId, async (tx) => {
      if (doOut && input.fieldPlayerId) {
        await tx.insertEvent({
          match_id: input.matchId,
          player_id: input.fieldPlayerId,
          event_type: 'sub_out',
          timestamp: input.timestamp,
          formation: input.formation,
          is_pk: false,
        })
        await tx.updatePlayerStats(input.fieldPlayerId, {
          match_status: 'bench',
          subbed_in_at: null,
          total_seconds_played: input.fieldTotalSecondsPlayed ?? 0,
          total_minutes: (input.fieldTotalSecondsPlayed ?? 0) / 60,
        })
      }

      if (doIn && input.benchPlayerId) {
        const position = input.tacticalPosition?.trim() || null
        await tx.insertEvent({
          match_id: input.matchId,
          player_id: input.benchPlayerId,
          event_type: 'sub_in',
          timestamp: input.timestamp,
          formation: input.formation,
          event_notes: position,
          is_pk: false,
        })
        const patch: Record<string, unknown> = {
          match_status: 'on-field',
          subbed_in_at: input.benchSubbedInAt ?? null,
        }
        if (position) patch.match_position = position
        await tx.updatePlayerStats(input.benchPlayerId, patch)
      }
    })

    if (!access.match.is_test) {
      const hubPath = input.teamSlug
        ? `/hub/${encodeURIComponent(input.teamSlug)}`
        : '/'
      const periodOpts = {
        currentPeriod: input.currentPeriod,
        totalPeriods: input.totalPeriods,
      }

      if (doOut && input.fieldPlayerId && input.fieldPlayerLabel) {
        const push = buildSubstitutionPush({
          playerLabel: input.fieldPlayerLabel,
          direction: 'OFF',
          ...periodOpts,
        })
        queueTeamWebPush(auth.supabase, {
          teamId: access.match.team_id,
          title: push.title,
          body: push.body,
          url: hubPath,
          tag: `vvfc-sub-${input.matchId}-${input.fieldPlayerId}`,
          eventType: 'substitution',
          playerId: input.fieldPlayerId,
        })
      }

      if (doIn && input.benchPlayerId && input.benchPlayerLabel) {
        const push = buildSubstitutionPush({
          playerLabel: input.benchPlayerLabel,
          direction: 'ON',
          ...periodOpts,
        })
        queueTeamWebPush(auth.supabase, {
          teamId: access.match.team_id,
          title: push.title,
          body: push.body,
          url: hubPath,
          tag: `vvfc-sub-${input.matchId}-${input.benchPlayerId}`,
          eventType: 'substitution',
          playerId: input.benchPlayerId,
        })
      }
    }

    return res.status(200).json({ ok: true, kind: input.kind })
  } catch (err) {
    console.error('[api/match/log-substitution]', err)
    return res.status(500).json({
      ok: false,
      error: err instanceof Error ? err.message : 'Failed to log substitution',
    })
  }
}
