import type { VercelRequest, VercelResponse } from '@vercel/node'
import { corsPreflight, parseJsonBody, requireStaffSession } from '../_lib/auth'
import { requireMatchAccess } from '../_lib/match-access'
import { EndRegulationInputSchema } from '../_lib/match-action-schemas'
import { buildFullTimePush } from '../_lib/push-copy'
import { queueTeamWebPush } from '../_lib/send-web-push'
import { insertMatchEventRow } from '../_lib/match-writes'

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

    // Period-end sub_out markers for Parent Hub / recap.
    for (const playerId of input.onFieldPlayerIds) {
      await insertMatchEventRow(auth.supabase, {
        match_id: input.matchId,
        player_id: playerId,
        event_type: 'sub_out',
        timestamp: elapsed,
        formation: input.formation,
        event_notes: PERIOD_END_NOTE,
        is_pk: false,
      })
    }

    // Mark on-field players as off for remaining match_stats rows.
    if (input.onFieldPlayerIds.length > 0) {
      const { error: statsError } = await auth.supabase
        .from('match_stats')
        .update({
          match_status: 'bench',
          subbed_in_at: null,
        })
        .eq('match_id', input.matchId)
        .in('player_id', input.onFieldPlayerIds)
      if (statsError) {
        console.warn('[end-regulation] match_stats update', statsError.message)
      }
    }

    // Persist timing context in qualitative_context when possible.
    const { data: matchRow } = await auth.supabase
      .from('matches')
      .select('qualitative_context')
      .eq('id', input.matchId)
      .maybeSingle()

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
      const { error } = await auth.supabase
        .from('matches')
        .update({
          home_pk_score: 0,
          away_pk_score: 0,
          pk_winner_is_us: null,
          pk_gk_player_id: null,
          period_clock_started: false,
          clock_seconds: persistableClockSeconds(input.clockSeconds),
          qualitative_context: nextContext,
          status: 'live',
        })
        .eq('id', input.matchId)
      if (error) throw error

      return res.status(200).json({
        ok: true,
        status: 'live',
        enterPenaltyShootout: true,
      })
    }

    const { error: pendingError } = await auth.supabase
      .from('matches')
      .update({
        status: 'pending_review',
        period_clock_started: false,
        clock_seconds: persistableClockSeconds(input.clockSeconds),
        qualitative_context: nextContext,
      })
      .eq('id', input.matchId)
    if (pendingError) throw pendingError

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
      status: 'pending_review',
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
