import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'
import { checkWriteRateLimit, rejectTooManyRequests } from './_lib/rate-limit.js'
import { reportApiError } from './_lib/sentry.js'
import { assertNoClientLeakedSecrets, requirePublishableSupabaseEnv } from './_lib/server-env.js'

const RESPONSES = new Set(['in', 'out', 'maybe'])

function readBody(req: VercelRequest): Record<string, unknown> {
  if (req.body && typeof req.body === 'object') return req.body as Record<string, unknown>
  return {}
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  assertNoClientLeakedSecrets()
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'content-type')
  res.setHeader('Cache-Control', 'no-store')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' })
  }

  const limited = checkWriteRateLimit(req)
  if (!limited.ok) {
    rejectTooManyRequests(res, limited.retryAfterSec)
    return
  }

  const body = readBody(req)
  const slug = typeof body.slug === 'string' ? body.slug.trim().toLowerCase() : ''
  const matchId = typeof body.matchId === 'string' ? body.matchId.trim() : ''
  const playerId = typeof body.playerId === 'string' ? body.playerId.trim() : ''
  const response = typeof body.response === 'string' ? body.response.trim() : ''

  if (!slug || !matchId || !playerId || !RESPONSES.has(response)) {
    return res.status(400).json({ ok: false, error: 'Invalid availability' })
  }

  let url: string
  let key: string
  try {
    ;({ url, key } = requirePublishableSupabaseEnv())
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err instanceof Error ? err.message : 'Supabase env not configured',
    })
  }

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  try {
    const { data, error } = await supabase.rpc('set_parent_match_rsvp', {
      p_slug: slug,
      p_match_id: matchId,
      p_player_id: playerId,
      p_response: response,
    })
    if (error) {
      const message = error.message || 'Could not save availability'
      const status = /not found|closed|not on this team|invalid/i.test(message) ? 400 : 500
      return res.status(status).json({ ok: false, error: message })
    }
    return res.status(200).json(data ?? { ok: true, response })
  } catch (err) {
    await reportApiError('[api/rsvp]', err)
    return res.status(500).json({
      ok: false,
      error: err instanceof Error ? err.message : 'Could not save availability',
    })
  }
}
