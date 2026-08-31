import type { VercelRequest, VercelResponse } from '@vercel/node'
import { corsPreflight } from './_lib/auth.js'
import { checkWriteRateLimit, rejectTooManyRequests } from './_lib/rate-limit.js'
import { assertNoClientLeakedSecrets } from './_lib/server-env.js'
import endRegulation from './_lib/match-handlers/end-regulation.js'
import finalizePk from './_lib/match-handlers/finalize-pk.js'
import finalizeReview from './_lib/match-handlers/finalize-review.js'
import logCard from './_lib/match-handlers/log-card.js'
import logFormation from './_lib/match-handlers/log-formation.js'
import logGoal from './_lib/match-handlers/log-goal.js'
import logPeriod from './_lib/match-handlers/log-period.js'
import logPkAttempt from './_lib/match-handlers/log-pk-attempt.js'
import logSubstitution from './_lib/match-handlers/log-substitution.js'
import logTeamEvent from './_lib/match-handlers/log-team-event.js'
import removeLastGoal from './_lib/match-handlers/remove-last-goal.js'

type MatchHandler = (req: VercelRequest, res: VercelResponse) => Promise<unknown>

const MATCH_HANDLERS: Record<string, MatchHandler> = {
  'end-regulation': endRegulation,
  'finalize-pk': finalizePk,
  'finalize-review': finalizeReview,
  'log-card': logCard,
  'log-formation': logFormation,
  'log-goal': logGoal,
  'log-period': logPeriod,
  'log-pk-attempt': logPkAttempt,
  'log-substitution': logSubstitution,
  'log-team-event': logTeamEvent,
  'remove-last-goal': removeLastGoal,
}

function firstQueryValue(value: string | string[] | undefined): string | null {
  if (typeof value === 'string' && value) return value
  if (Array.isArray(value) && typeof value[0] === 'string' && value[0]) {
    return value[0]
  }
  return null
}

function actionFromRequest(req: VercelRequest): string | null {
  const fromQuery = firstQueryValue(req.query?.action)
  if (fromQuery) return fromQuery

  const path = (req.url ?? '').split('?')[0] ?? ''
  const match = path.match(/\/api\/match\/([^/]+)\/?$/)
  return match?.[1] ?? null
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  assertNoClientLeakedSecrets()

  const action = actionFromRequest(req)
  const impl = action ? MATCH_HANDLERS[action] : undefined
  if (!impl) {
    if (req.method === 'OPTIONS') {
      corsPreflight(res)
      return res.status(200).end()
    }
    corsPreflight(res)
    return res.status(404).json({ ok: false, error: 'Unknown match action' })
  }

  const limited = checkWriteRateLimit(req)
  if (!limited.ok) {
    rejectTooManyRequests(res, limited.retryAfterSec)
    return
  }

  return impl(req, res)
}
