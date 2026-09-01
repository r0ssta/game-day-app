import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'
import { applyParentHubCacheHeaders } from './_lib/parent-hub-cache.js'
import { reportApiError } from './_lib/sentry.js'
import { assertNoClientLeakedSecrets, requirePublishableSupabaseEnv } from './_lib/server-env.js'

function firstQueryValue(value: string | string[] | undefined): string | null {
  if (typeof value === 'string' && value.trim()) return value.trim()
  if (Array.isArray(value) && typeof value[0] === 'string' && value[0].trim()) {
    return value[0].trim()
  }
  return null
}

function slugFromRequest(req: VercelRequest): string | null {
  const fromQuery = firstQueryValue(req.query?.slug)
  if (fromQuery) return fromQuery.toLowerCase()

  const path = (req.url ?? '').split('?')[0] ?? ''
  const match = path.match(/\/api\/hub\/([^/]+)\/?$/)
  if (!match?.[1]) return null
  try {
    return decodeURIComponent(match[1]).trim().toLowerCase()
  } catch {
    return match[1].trim().toLowerCase()
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  assertNoClientLeakedSecrets()

  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'content-type')

  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' })
  }

  const slug = slugFromRequest(req)
  if (!slug) {
    return res.status(400).json({ ok: false, error: 'Missing team slug' })
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
    const { data, error } = await supabase.rpc('get_parent_hub_by_slug', {
      p_slug: slug,
    })
    if (error) throw error
    if (!data || typeof data !== 'object') {
      return res.status(404).json({ ok: false, error: 'Team hub not found' })
    }

    applyParentHubCacheHeaders(res, slug)
    return res.status(200).json(data)
  } catch (err) {
    await reportApiError('[api/hub]', err)
    return res.status(500).json({
      ok: false,
      error: err instanceof Error ? err.message : 'Failed to load team hub',
    })
  }
}
