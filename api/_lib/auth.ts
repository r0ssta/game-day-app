import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js'
import { requirePublishableSupabaseEnv } from './server-env.js'

export type AuthedContext = {
  supabase: SupabaseClient
  user: User
  accessToken: string
}

const STAFF_AUTH_TTL_MS = 45_000
const staffAuthCache = new Map<string, { user: User; at: number }>()

function jwtUnexpired(token: string): boolean {
  try {
    const payload = token.split('.')[1]
    if (!payload) return false
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      exp?: unknown
    }
    return typeof parsed.exp === 'number' && parsed.exp * 1000 > Date.now() + 5_000
  } catch {
    return false
  }
}

function readCachedStaffUser(token: string): User | null {
  if (!jwtUnexpired(token)) {
    staffAuthCache.delete(token)
    return null
  }
  const hit = staffAuthCache.get(token)
  if (!hit || Date.now() - hit.at >= STAFF_AUTH_TTL_MS) {
    staffAuthCache.delete(token)
    return null
  }
  return hit.user
}

function rememberStaffUser(token: string, user: User): void {
  staffAuthCache.set(token, { user, at: Date.now() })
  if (staffAuthCache.size <= 200) return
  const now = Date.now()
  for (const [key, entry] of staffAuthCache) {
    if (now - entry.at >= STAFF_AUTH_TTL_MS) staffAuthCache.delete(key)
  }
}

function supabaseEnv() {
  return requirePublishableSupabaseEnv()
}

/** User-scoped Supabase client from `Authorization: Bearer <access_token>`.
 * Uses the Data API (HTTPS), not a Postgres TCP connection.
 */
export function createUserSupabaseClient(authHeader: string): SupabaseClient {
  const { url, key } = supabaseEnv()
  return createClient(url, key, {
    global: { headers: { Authorization: authHeader } },
  })
}

export function readBearerToken(req: VercelRequest): string | null {
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) return null
  return authHeader.slice('Bearer '.length).trim() || null
}

export function corsPreflight(res: VercelResponse): void {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', 'authorization, content-type')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
}

export function parseJsonBody(req: VercelRequest): unknown {
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body)
    } catch {
      return null
    }
  }
  return req.body ?? null
}

/**
 * Require a valid staff session. Relies on RLS for row access; also verifies
 * the caller has a `user_roles` row (pending coaches are rejected).
 */
export async function requireStaffSession(
  req: VercelRequest,
): Promise<AuthedContext | { error: string; status: number }> {
  const rawHeader = req.headers.authorization
  const authHeader = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader
  if (!authHeader?.startsWith('Bearer ')) {
    return { error: 'Authorization required', status: 401 }
  }

  const accessToken = authHeader.slice('Bearer '.length).trim()
  if (!accessToken) {
    return { error: 'Authorization required', status: 401 }
  }

  let url: string
  let key: string
  try {
    ;({ url, key } = supabaseEnv())
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Supabase env not configured',
      status: 500,
    }
  }

  const cachedUser = readCachedStaffUser(accessToken)
  let user: User
  if (cachedUser) {
    user = cachedUser
  } else {
    const authClient = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const {
      data: { user: fetched },
      error: authError,
    } = await authClient.auth.getUser(accessToken)
    if (authError || !fetched) {
      console.error('[requireStaffSession] getUser', authError?.message ?? 'no user')
      return { error: 'Invalid session', status: 401 }
    }
    user = fetched
  }

  const supabase = createClient(url, key, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })

  if (!cachedUser) {
    const { data: roleRow, error: roleError } = await supabase
      .from('user_roles')
      .select('app_role')
      .eq('user_id', user.id)
      .maybeSingle()

    if (roleError) {
      console.error('[requireStaffSession] role lookup', roleError)
      return { error: 'Failed to verify staff access', status: 500 }
    }

    const role = roleRow?.app_role
    if (!role || role === 'pending') {
      return { error: 'Staff access required', status: 403 }
    }
    rememberStaffUser(accessToken, user)
  }

  return {
    supabase,
    user,
    accessToken,
  }
}
