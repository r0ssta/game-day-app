import type { VercelRequest, VercelResponse } from '@vercel/node'
import { corsPreflight, parseJsonBody, requireStaffSession } from '../_lib/auth'
import { requireMatchAccess } from '../_lib/match-access'
import { LogCardInputSchema } from '../_lib/match-action-schemas'
import { reportApiError } from '../_lib/sentry'
import { buildCardPush } from '../_lib/push-copy'
import { queueTeamWebPush } from '../_lib/send-web-push'
import { type MatchEventInsert, runMatchWrites } from '../_lib/match-writes'

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

    const parsed = LogCardInputSchema.safeParse(parseJsonBody(req))
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

    const isSecondYellow = input.kind === 'yellow' && input.yellowCardCountBefore >= 1
    const issueRed = input.kind === 'red' || isSecondYellow

    await runMatchWrites(auth.supabase, input.matchId, async (tx) => {
      const events: MatchEventInsert[] = []
      if (input.kind === 'yellow' || isSecondYellow) {
        events.push({
          match_id: input.matchId,
          player_id: input.playerId,
          event_type: 'yellow_card',
          timestamp: input.timestamp,
          formation: input.formation,
          event_notes: isSecondYellow ? 'second_yellow' : null,
          is_pk: false,
        })
      }
      if (issueRed) {
        events.push({
          match_id: input.matchId,
          player_id: input.playerId,
          event_type: 'red_card',
          timestamp: input.timestamp,
          formation: input.formation,
          event_notes: isSecondYellow ? 'second_yellow' : 'straight_red',
          is_pk: false,
        })
        if (input.isOnField) {
          events.push({
            match_id: input.matchId,
            player_id: input.playerId,
            event_type: 'sub_out',
            timestamp: input.timestamp,
            formation: input.formation,
            event_notes: 'sent_off',
            is_pk: false,
          })
        }
      }
      await tx.insertEvents(events)

      if (issueRed) {
        const statsUpdate: Record<string, unknown> = {
          is_sent_off: true,
          match_status: 'bench',
          subbed_in_at: null,
        }
        if (typeof input.totalSecondsPlayed === 'number') {
          statsUpdate.total_seconds_played = input.totalSecondsPlayed
          statsUpdate.total_minutes = input.totalSecondsPlayed / 60
        }
        await tx.updatePlayerStats(input.playerId, statsUpdate)
      }
    })

    if (!access.match.is_test) {
      const push = buildCardPush({
        playerLabel: input.playerLabel,
        kind: issueRed ? 'red' : 'yellow',
        isSecondYellow,
      })
      const hubPath = input.teamSlug
        ? `/hub/${encodeURIComponent(input.teamSlug)}`
        : '/'
      queueTeamWebPush(auth.supabase, {
        teamId: access.match.team_id,
        title: push.title,
        body: push.body,
        url: hubPath,
        tag: `vvfc-card-${input.matchId}`,
        eventType: 'card',
        playerId: input.playerId,
      })
    }

    return res.status(200).json({
      ok: true,
      isSecondYellow,
      issueRed,
    })
  } catch (err) {
    await reportApiError('[api/match/log-card]', err)
    return res.status(500).json({
      ok: false,
      error: err instanceof Error ? err.message : 'Failed to log card',
    })
  }
}
