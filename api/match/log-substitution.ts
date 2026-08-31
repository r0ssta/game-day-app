import type { VercelRequest, VercelResponse } from '@vercel/node'
import type { SupabaseClient } from '@supabase/supabase-js'
import { corsPreflight, parseJsonBody, requireStaffSession } from '../_lib/auth'
import { requireMatchAccess } from '../_lib/match-access'
import { LogSubstitutionInputSchema } from '../_lib/match-action-schemas'
import { buildSubstitutionPush } from '../_lib/push-copy'
import { queueTeamWebPush } from '../_lib/send-web-push'
import { insertMatchEventRow } from '../_lib/match-writes'

async function updateFieldOutStats(
  supabase: SupabaseClient,
  matchId: string,
  playerId: string,
  totalSecondsPlayed: number,
) {
  const { error } = await supabase
    .from('match_stats')
    .update({
      match_status: 'bench',
      subbed_in_at: null,
      total_seconds_played: totalSecondsPlayed,
      total_minutes: totalSecondsPlayed / 60,
    })
    .eq('match_id', matchId)
    .eq('player_id', playerId)
  if (error) {
    console.warn('[log-substitution] field out stats', error.message)
  }
}

async function updateBenchInStats(
  supabase: SupabaseClient,
  matchId: string,
  playerId: string,
  subbedInAt: number | null,
  matchPosition: string | undefined,
) {
  const patch: Record<string, unknown> = {
    match_status: 'on-field',
    subbed_in_at: subbedInAt,
  }
  if (typeof matchPosition === 'string' && matchPosition.trim()) {
    patch.match_position = matchPosition.trim()
  }
  const { error } = await supabase
    .from('match_stats')
    .update(patch)
    .eq('match_id', matchId)
    .eq('player_id', playerId)
  if (error) {
    console.warn('[log-substitution] bench in stats', error.message)
  }
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

    if (doOut && input.fieldPlayerId) {
      await insertMatchEventRow(auth.supabase, {
        match_id: input.matchId,
        player_id: input.fieldPlayerId,
        event_type: 'sub_out',
        timestamp: input.timestamp,
        formation: input.formation,
        is_pk: false,
      })
      await updateFieldOutStats(
        auth.supabase,
        input.matchId,
        input.fieldPlayerId,
        input.fieldTotalSecondsPlayed ?? 0,
      )
    }

    if (doIn && input.benchPlayerId) {
      const position = input.tacticalPosition?.trim() || null
      await insertMatchEventRow(auth.supabase, {
        match_id: input.matchId,
        player_id: input.benchPlayerId,
        event_type: 'sub_in',
        timestamp: input.timestamp,
        formation: input.formation,
        event_notes: position,
        is_pk: false,
      })
      await updateBenchInStats(
        auth.supabase,
        input.matchId,
        input.benchPlayerId,
        input.benchSubbedInAt ?? null,
        position ?? undefined,
      )
    }

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
