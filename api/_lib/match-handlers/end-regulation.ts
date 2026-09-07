import type { VercelRequest, VercelResponse } from '@vercel/node'
import { corsPreflight, parseJsonBody, requireStaffSession } from '../auth.js'
import { requireMatchAccess } from '../match-access.js'
import { EndRegulationInputSchema } from '../match-action-schemas.js'
import { reportApiError } from '../sentry.js'
import { buildFullTimePush } from '../push-copy.js'
import { queueTeamWebPush } from '../send-web-push.js'
import { runMatchWrites } from '../match-writes.js'

const PERIOD_END_NOTE = 'period_end'

function persistableClockSeconds(clockSeconds: number): number {
  // Match client: store remaining regulation seconds (clamp OT remaining to 0).
  return Math.max(0, clockSeconds)
}

function addedTimeSeconds(clockSeconds: number): number {
  return clockSeconds < 0 ? Math.abs(clockSeconds) : 0
}

type EndRegulationResult = {
  status: string
  enterPenaltyShootout: boolean
  enterExtraTime: boolean
  advanceExtraTime: boolean
  extraTimeHalfMinutes: number | null
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

    const keepLineupOnField = Boolean(input.enterExtraTime || input.advanceExtraTime)
    const halfSeconds = Math.max(1, input.halfLengthMinutes) * 60
    const elapsed = halfSeconds - input.clockSeconds

    const writeResult = await runMatchWrites(
      auth.supabase,
      input.matchId,
      async (tx): Promise<EndRegulationResult> => {
        if (!keepLineupOnField) {
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
        }

        const { data: matchRow, error: contextError } = await auth.supabase
          .from('matches')
          .select('qualitative_context, half_length, period_length')
          .eq('id', input.matchId)
          .maybeSingle()
        if (contextError) throw contextError

        const prior =
          matchRow?.qualitative_context && typeof matchRow.qualitative_context === 'object'
            ? (matchRow.qualitative_context as Record<string, unknown>)
            : {}
        const regulationHalfLength =
          typeof matchRow?.half_length === 'number' && matchRow.half_length > 0
            ? matchRow.half_length
            : input.halfLengthMinutes

        if (input.enterExtraTime) {
          const extraTimeHalfMinutes = input.extraTimeHalfMinutes ?? 5
          const extraTimeSeconds = extraTimeHalfMinutes * 60
          await tx.updateMatch({
            status: 'extra_time_first_half',
            period_clock_started: false,
            clock_seconds: extraTimeSeconds,
            period_length: extraTimeHalfMinutes,
            qualitative_context: {
              ...prior,
              addedTimeSeconds: addedTimeSeconds(input.clockSeconds),
              endedOnTime: input.endedOnTime ?? null,
              extraTimeHalfMinutes,
            },
          })
          return {
            status: 'extra_time_first_half',
            enterPenaltyShootout: false,
            enterExtraTime: true,
            advanceExtraTime: false,
            extraTimeHalfMinutes,
          }
        }

        if (input.advanceExtraTime) {
          const extraTimeHalfMinutes =
            input.extraTimeHalfMinutes ??
            (typeof prior.extraTimeHalfMinutes === 'number' && prior.extraTimeHalfMinutes > 0
              ? Math.floor(prior.extraTimeHalfMinutes)
              : typeof matchRow?.period_length === 'number' && matchRow.period_length > 0
                ? matchRow.period_length
                : 5)
          const extraTimeSeconds = extraTimeHalfMinutes * 60
          await tx.updateMatch({
            status: 'extra_time_second_half',
            period_clock_started: false,
            clock_seconds: extraTimeSeconds,
            period_length: extraTimeHalfMinutes,
            qualitative_context: {
              ...prior,
              extraTimeHalfMinutes,
            },
          })
          return {
            status: 'extra_time_second_half',
            enterPenaltyShootout: false,
            enterExtraTime: false,
            advanceExtraTime: true,
            extraTimeHalfMinutes,
          }
        }

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
            period_length: regulationHalfLength,
            qualitative_context: nextContext,
            status: 'penalty_shootout',
          })
          return {
            status: 'penalty_shootout',
            enterPenaltyShootout: true,
            enterExtraTime: false,
            advanceExtraTime: false,
            extraTimeHalfMinutes: null,
          }
        }

        await tx.updateMatch({
          status: 'pending_review',
          period_clock_started: false,
          clock_seconds: persistableClockSeconds(input.clockSeconds),
          period_length: regulationHalfLength,
          qualitative_context: nextContext,
        })
        return {
          status: 'pending_review',
          enterPenaltyShootout: false,
          enterExtraTime: false,
          advanceExtraTime: false,
          extraTimeHalfMinutes: null,
        }
      },
    )

    if (writeResult.enterPenaltyShootout || writeResult.enterExtraTime || writeResult.advanceExtraTime) {
      return res.status(200).json({
        ok: true,
        ...writeResult,
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
      ...writeResult,
    })
  } catch (err) {
    await reportApiError('[api/match/end-regulation]', err)
    return res.status(500).json({
      ok: false,
      error: err instanceof Error ? err.message : 'Failed to end regulation',
    })
  }
}
