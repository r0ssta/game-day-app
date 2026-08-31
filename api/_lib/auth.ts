import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js'

export type AuthedContext = {
  supabase: SupabaseClient
  user: User
  accessToken: string
}

function supabaseEnv() {
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
  const key =
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.SUPABASE_PUBLISHABLE_KEY
  if (!url || !key) {
    throw new Error('Supabase env not configured')
  }
  return { url, key }
}

/** User-scoped Supabase client from `Authorization: Bearer <access_token>`. */
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
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    return { error: 'Authorization required', status: 401 }
  }

  let supabase: SupabaseClient
  try {
    supabase = createUserSupabaseClient(authHeader)
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Supabase env not configured',
      status: 500,
    }
  }

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) {
    return { error: 'Invalid session', status: 401 }
  }

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

  return {
    supabase,
    user,
    accessToken: authHeader.slice('Bearer '.length).trim(),
  }
}
