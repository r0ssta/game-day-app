import type { VercelRequest, VercelResponse } from '@vercel/node'
import type { SupabaseClient } from '@supabase/supabase-js'
import { corsPreflight, parseJsonBody, requireStaffSession } from '../_lib/auth'
import { requireMatchAccess } from '../_lib/match-access'
import { LogPeriodInputSchema } from '../_lib/match-action-schemas'
import { reportApiError } from '../_lib/sentry'
import {
  buildMatchStartPush,
  buildPeriodPush,
} from '../_lib/push-copy'
import { queueTeamWebPush } from '../_lib/send-web-push'
import { runMatchWrites } from '../_lib/match-writes'

const PERIOD_END_NOTE = 'period_end'
const STARTING_LINEUP_NOTE_PREFIX = 'starting_lineup|'

function persistableClockSeconds(clockSeconds: number): number {
  return Math.max(0, clockSeconds)
}

function addedTimeSeconds(clockSeconds: number): number {
  return clockSeconds < 0 ? Math.abs(clockSeconds) : 0
}

function startingLineupNote(position: string | null | undefined): string {
  const pos = (position ?? '').trim()
  return pos ? `${STARTING_LINEUP_NOTE_PREFIX}${pos}` : STARTING_LINEUP_NOTE_PREFIX.slice(0, -1)
}

async function mergeTimingContext(
  tx: { updateMatch: (patch: Record<string, unknown>) => Promise<void> },
  supabase: SupabaseClient,
  matchId: string,
  timing: { addedTimeSeconds?: number },
) {
  const { data: matchRow, error } = await supabase
    .from('matches')
    .select('qualitative_context')
    .eq('id', matchId)
    .maybeSingle()
  if (error) throw error

  const prior =
    matchRow?.qualitative_context && typeof matchRow.qualitative_context === 'object'
      ? (matchRow.qualitative_context as Record<string, unknown>)
      : {}

  const nextContext = {
    ...prior,
    ...(timing.addedTimeSeconds !== undefined
      ? { addedTimeSeconds: Math.max(0, Math.floor(timing.addedTimeSeconds)) }
      : {}),
  }

  await tx.updateMatch({ qualitative_context: nextContext })
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

    const parsed = LogPeriodInputSchema.safeParse(parseJsonBody(req))
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

    const hubPath = input.teamSlug
      ? `/hub/${encodeURIComponent(input.teamSlug)}`
      : '/'
    const starterLabels = input.starters.map((s) => s.label)

    if (input.kind === 'end') {
      const halfSeconds = Math.max(1, input.halfLengthMinutes) * 60
      const elapsed = halfSeconds - input.clockSeconds

      await runMatchWrites(auth.supabase, input.matchId, async (tx) => {
        for (const player of input.onFieldPlayers) {
          await tx.insertEvent({
            match_id: input.matchId,
            player_id: player.playerId,
            event_type: 'sub_out',
            timestamp: elapsed,
            formation: input.formation,
            event_notes: PERIOD_END_NOTE,
            is_pk: false,
          })
          await tx.updatePlayerStats(player.playerId, {
            match_status: 'bench',
            subbed_in_at: null,
            total_seconds_played: player.totalSecondsPlayed,
            total_minutes: player.totalSecondsPlayed / 60,
          })
        }

        await tx.updateMatch({
          period_clock_started: false,
          clock_seconds: persistableClockSeconds(input.clockSeconds),
          current_period: input.period,
          total_periods: input.totalPeriods,
          period_length: input.halfLengthMinutes,
          half_length: input.halfLengthMinutes,
        })

        await mergeTimingContext(tx, auth.supabase, input.matchId, {
          addedTimeSeconds: addedTimeSeconds(input.clockSeconds),
        })
      })

      if (!access.match.is_test) {
        const push = buildPeriodPush({
          teamName: input.teamName,
          opponent: input.opponent,
          kind: 'end',
          period: input.period,
          totalPeriods: input.totalPeriods,
          homeScore: input.homeScore,
          awayScore: input.awayScore,
        })
        queueTeamWebPush(auth.supabase, {
          teamId: access.match.team_id,
          title: push.title,
          body: push.body,
          url: hubPath,
          tag: `vvfc-period-end-${input.matchId}-${input.period}`,
          eventType: 'period_end',
        })
      }

      return res.status(200).json({ ok: true, kind: 'end', period: input.period })
    }

    // kind === 'start'
    await runMatchWrites(auth.supabase, input.matchId, async (tx) => {
      if (input.insertStarterEvents) {
        for (const starter of input.starters) {
          await tx.insertEvent({
            match_id: input.matchId,
            player_id: starter.playerId,
            event_type: 'sub_in',
            timestamp: 0,
            formation: input.formation,
            event_notes: startingLineupNote(starter.matchPosition),
            is_pk: false,
          })
        }
      }

      for (const starter of input.starters) {
        const patch: Record<string, unknown> = {
          match_status: 'on-field',
          subbed_in_at: starter.subbedInAt ?? null,
        }
        if (typeof starter.matchPosition === 'string' && starter.matchPosition.trim()) {
          patch.match_position = starter.matchPosition.trim()
        }
        if (typeof starter.totalSecondsPlayed === 'number') {
          patch.total_seconds_played = starter.totalSecondsPlayed
          patch.total_minutes = starter.totalSecondsPlayed / 60
        }
        await tx.updatePlayerStats(starter.playerId, patch)
      }

      const matchPatch: Record<string, unknown> = {
        period_clock_started: true,
        clock_seconds: persistableClockSeconds(input.clockSeconds),
        current_period: input.period,
        total_periods: input.totalPeriods,
        period_length: input.halfLengthMinutes,
        half_length: input.halfLengthMinutes,
      }
      if (input.periodCode) {
        matchPatch.period = input.periodCode
      }
      await tx.updateMatch(matchPatch)

      if (input.insertStarterEvents) {
        await mergeTimingContext(tx, auth.supabase, input.matchId, {
          addedTimeSeconds: 0,
        })
      }
    })

    if (!access.match.is_test) {
      const push =
        input.period <= 1
          ? buildMatchStartPush({
              teamName: input.teamName,
              opponent: input.opponent,
              starterLabels,
              currentPeriod: input.period,
              totalPeriods: input.totalPeriods,
            })
          : buildPeriodPush({
              teamName: input.teamName,
              opponent: input.opponent,
              kind: 'start',
              period: input.period,
              totalPeriods: input.totalPeriods,
              starterLabels,
            })
      queueTeamWebPush(auth.supabase, {
        teamId: access.match.team_id,
        title: push.title,
        body: push.body,
        url: hubPath,
        tag: `vvfc-period-start-${input.matchId}-${input.period}`,
        eventType: input.period <= 1 ? 'match_start' : 'period_start',
      })
    }

    return res.status(200).json({ ok: true, kind: 'start', period: input.period })
  } catch (err) {
    await reportApiError('[api/match/log-period]', err)
    return res.status(500).json({
      ok: false,
      error: err instanceof Error ? err.message : 'Failed to log period',
    })
  }
}
