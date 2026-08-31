import type { VercelRequest, VercelResponse } from '@vercel/node'
import { corsPreflight, parseJsonBody, requireStaffSession } from '../_lib/auth'
import { requireMatchAccess } from '../_lib/match-access'
import { LogGoalInputSchema } from '../_lib/match-action-schemas'
import { buildGoalPush } from '../_lib/push-copy'
import { queueTeamWebPush } from '../_lib/send-web-push'
import {
  bumpOnFieldPlusMinus,
  insertMatchEventRow,
} from '../_lib/match-writes'

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

    const parsed = LogGoalInputSchema.safeParse(parseJsonBody(req))
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

    const nextHome = input.ourGoal ? input.homeScoreBefore + 1 : input.homeScoreBefore
    const nextAway = input.ourGoal ? input.awayScoreBefore : input.awayScoreBefore + 1
    const eventType = input.ourGoal ? 'goal' : 'opponent_goal'
    const shotType = input.ourGoal ? 'shot_home' : 'shot_away'
    const plusMinusDelta: 1 | -1 = input.ourGoal ? 1 : -1

    const { error: scoreError } = await auth.supabase
      .from('matches')
      .update({ home_score: nextHome, away_score: nextAway })
      .eq('id', input.matchId)
    if (scoreError) throw scoreError

    await insertMatchEventRow(auth.supabase, {
      match_id: input.matchId,
      player_id: input.ourGoal ? (input.scorerId ?? null) : null,
      event_type: eventType,
      timestamp: input.timestamp,
      formation: input.formation,
      assist_player_id: input.ourGoal && !input.isPk ? (input.assistPlayerId ?? null) : null,
      is_pk: input.isPk,
    })

    if (input.pairAutoShot) {
      await insertMatchEventRow(auth.supabase, {
        match_id: input.matchId,
        player_id: null,
        event_type: shotType,
        timestamp: input.timestamp,
        formation: input.formation,
        is_pk: false,
      })
    }

    await bumpOnFieldPlusMinus(
      auth.supabase,
      input.matchId,
      input.onFieldPlayerIds,
      plusMinusDelta,
    )

    const push = buildGoalPush({
      teamName: input.teamName.trim() || 'Home',
      opponent: input.opponent,
      homeScore: nextHome,
      awayScore: nextAway,
      scorerLabel: input.scorerLabel,
      assistLabel: input.assistLabel,
      isPk: input.isPk,
      ourGoal: input.ourGoal,
    })

    const hubPath = input.teamSlug
      ? `/hub/${encodeURIComponent(input.teamSlug)}`
      : '/'

    if (!access.match.is_test) {
      queueTeamWebPush(auth.supabase, {
        teamId: access.match.team_id,
        title: push.title,
        body: push.body,
        url: hubPath,
        tag: `vvfc-goal-${input.matchId}`,
        eventType: 'goal',
      })
    }

    return res.status(200).json({
      ok: true,
      homeScore: nextHome,
      awayScore: nextAway,
      eventType,
    })
  } catch (err) {
    console.error('[api/match/log-goal]', err)
    return res.status(500).json({
      ok: false,
      error: err instanceof Error ? err.message : 'Failed to log goal',
    })
  }
}
