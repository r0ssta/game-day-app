import type { VercelRequest, VercelResponse } from '@vercel/node'
import type { ZodType } from 'zod'
import { corsPreflight, parseJsonBody, requireStaffSession } from './auth.js'
import { requireMatchAccess, type MatchAccessRow } from './match-access.js'
import type { AuthedContext } from './auth.js'
import { reportApiError } from './sentry.js'

export function methodGuard(req: VercelRequest, res: VercelResponse): boolean {
  if (req.method === 'OPTIONS') {
    corsPreflight(res)
    res.status(200).end()
    return false
  }
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'Method not allowed' })
    return false
  }
  corsPreflight(res)
  return true
}

export async function withMatchMutation<T>(
  req: VercelRequest,
  res: VercelResponse,
  schema: ZodType<T>,
  matchIdOf: (input: T) => string,
  run: (ctx: AuthedContext, input: T, match: MatchAccessRow) => Promise<void>,
): Promise<void> {
  if (!methodGuard(req, res)) return

  const auth = await requireStaffSession(req)
  if ('error' in auth) {
    res.status(auth.status).json({ ok: false, error: auth.error })
    return
  }

  const parsed = schema.safeParse(parseJsonBody(req))
  if (!parsed.success) {
    res.status(400).json({
      ok: false,
      error: 'Invalid payload',
      code: 'validation_error',
      details: parsed.error.flatten(),
    })
    return
  }

  const access = await requireMatchAccess(auth.supabase, matchIdOf(parsed.data))
  if ('error' in access) {
    res.status(access.status).json({ ok: false, error: access.error })
    return
  }

  try {
    await run(auth, parsed.data, access.match)
  } catch (err) {
    await reportApiError('[match mutation]', err)
    res.status(500).json({
      ok: false,
      error: err instanceof Error ? err.message : 'Mutation failed',
    })
  }
}

export function elapsedInHalf(clockSeconds: number, halfLengthMinutes: number): number {
  const halfSeconds = Math.max(1, halfLengthMinutes) * 60
  // clockSeconds counts down from half length; elapsed = half - remaining (can go over in OT).
  return halfSeconds - clockSeconds
}
