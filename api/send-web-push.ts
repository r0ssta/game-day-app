import type { VercelRequest, VercelResponse } from '@vercel/node'
import { corsPreflight, parseJsonBody, requireStaffSession } from './_lib/auth.js'
import { checkWriteRateLimit, rejectTooManyRequests } from './_lib/rate-limit.js'
import { assertNoClientLeakedSecrets, requireVapidConfig } from './_lib/server-env.js'
import { sendTeamWebPush } from './_lib/send-web-push.js'
import { reportApiError } from './_lib/sentry.js'

type SendBody = {
  teamId?: string
  title?: string
  body?: string
  url?: string
  tag?: string
  playerId?: string | null
  eventType?: string
}

/** Thin HTTP wrapper — core fan-out lives in `api/_lib/send-web-push.ts`. */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  assertNoClientLeakedSecrets()

  if (req.method === 'OPTIONS') {
    corsPreflight(res)
    return res.status(200).end()
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  corsPreflight(res)

  const limited = checkWriteRateLimit(req)
  if (!limited.ok) {
    rejectTooManyRequests(res, limited.retryAfterSec)
    return
  }

  try {
    requireVapidConfig()
    const auth = await requireStaffSession(req)
    if ('error' in auth) {
      return res.status(auth.status).json({ error: auth.error })
    }

    const input = parseJsonBody(req) as SendBody
    const teamId = input.teamId?.trim()
    const body = input.body?.trim()

    if (!teamId || !body) {
      return res.status(400).json({ error: 'teamId and body are required' })
    }

    const result = await sendTeamWebPush(auth.supabase, {
      teamId,
      title: input.title,
      body,
      url: input.url,
      tag: input.tag,
      playerId: input.playerId,
      eventType: input.eventType,
    })

    return res.status(200).json(result)
  } catch (err) {
    await reportApiError('[api/send-web-push]', err)
    return res.status(500).json({
      error: err instanceof Error ? err.message : 'Send failed',
    })
  }
}
