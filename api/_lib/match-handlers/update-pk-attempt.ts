import type { VercelRequest, VercelResponse } from '@vercel/node'
import { corsPreflight, parseJsonBody, requireStaffSession } from '../auth.js'
import { requireMatchAccess } from '../match-access.js'
import { UpdatePkAttemptInputSchema } from '../match-action-schemas.js'
import { reportApiError } from '../sentry.js'
import { runMatchWrites } from '../match-writes.js'

type PkResult = 'make' | 'miss'
type PkTeam = 'us' | 'opponent'

function parsePkNotes(raw: string | null | undefined): {
  result: PkResult
  team: PkTeam
  round: number
} | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as { result?: unknown; team?: unknown; round?: unknown }
    if (
      (parsed.result === 'make' || parsed.result === 'miss') &&
      (parsed.team === 'us' || parsed.team === 'opponent') &&
      typeof parsed.round === 'number' &&
      Number.isFinite(parsed.round)
    ) {
      return { result: parsed.result, team: parsed.team, round: parsed.round }
    }
  } catch {
    // fall through
  }
  return null
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

    const parsed = UpdatePkAttemptInputSchema.safeParse(parseJsonBody(req))
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

    let query = auth.supabase
      .from('match_events')
      .select('id, player_id, pk_result, pk_team, event_notes, timestamp, formation')
      .eq('match_id', input.matchId)
      .eq('event_type', 'pk_attempt')

    if (input.eventId) {
      query = query.eq('id', input.eventId)
    } else {
      query = query.eq('timestamp', input.round).eq('pk_team', input.team)
    }

    const { data: rows, error: lookupError } = await query
      .order('created_at', { ascending: false })
      .limit(1)
    if (lookupError) throw lookupError

    const existing = rows?.[0]
    if (!existing) {
      return res.status(404).json({ ok: false, error: 'PK attempt not found' })
    }

    const notes = parsePkNotes(existing.event_notes as string | null)
    const currentResult: PkResult | null =
      existing.pk_result === 'make' || existing.pk_result === 'miss'
        ? existing.pk_result
        : notes?.result ?? null
    const currentTeam: PkTeam | null =
      existing.pk_team === 'us' || existing.pk_team === 'opponent'
        ? existing.pk_team
        : notes?.team ?? input.team
    if (!currentResult || !currentTeam) {
      return res.status(409).json({ ok: false, error: 'PK attempt is missing a result' })
    }

    const scores = await runMatchWrites(auth.supabase, input.matchId, async (tx) => {
      if (input.action === 'clear') {
        await tx.deleteEvents([existing.id as string])
      } else {
        const nextResult: PkResult = currentResult === 'make' ? 'miss' : 'make'
        await tx.updateEvent(existing.id as string, {
          pk_result: nextResult,
          pk_team: currentTeam,
          event_notes: JSON.stringify({
            result: nextResult,
            team: currentTeam,
            round: notes?.round ?? input.round,
          }),
        })
      }

      const { data: remaining, error: remainingError } = await auth.supabase
        .from('match_events')
        .select('pk_result, pk_team, event_notes')
        .eq('match_id', input.matchId)
        .eq('event_type', 'pk_attempt')
      if (remainingError) throw remainingError

      let homePkScore = 0
      let awayPkScore = 0
      for (const row of remaining ?? []) {
        const parsedNotes = parsePkNotes(row.event_notes as string | null)
        const result =
          row.pk_result === 'make' || row.pk_result === 'miss'
            ? row.pk_result
            : parsedNotes?.result
        const team =
          row.pk_team === 'us' || row.pk_team === 'opponent' ? row.pk_team : parsedNotes?.team
        if (result !== 'make') continue
        if (team === 'us') homePkScore += 1
        if (team === 'opponent') awayPkScore += 1
      }

      await tx.updateMatch({ home_pk_score: homePkScore, away_pk_score: awayPkScore })
      return { homePkScore, awayPkScore }
    })

    return res.status(200).json({
      ok: true,
      action: input.action,
      homePkScore: scores.homePkScore,
      awayPkScore: scores.awayPkScore,
    })
  } catch (err) {
    await reportApiError('[api/match/update-pk-attempt]', err)
    return res.status(500).json({
      ok: false,
      error: err instanceof Error ? err.message : 'Failed to update PK attempt',
    })
  }
}
