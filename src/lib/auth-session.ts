import { supabase } from '@/supabaseClient'

export const AUTH_RECONNECT_TOAST = 'Reconnecting Auth...'

/** Refresh a minute before expiry so a locked phone does not send a dead JWT. */
const EXPIRY_SKEW_SEC = 60

export type SessionRefreshResult =
  | { ok: true; accessToken: string }
  | { ok: false; error: string }

function secondsUntilExpiry(expiresAt: number | undefined): number {
  if (!expiresAt || !Number.isFinite(expiresAt)) return 0
  return expiresAt - Math.floor(Date.now() / 1000)
}

export function sessionNeedsRefresh(expiresAt: number | undefined): boolean {
  return secondsUntilExpiry(expiresAt) <= EXPIRY_SKEW_SEC
}

/**
 * Return a valid access token, refreshing when the session is expired or close.
 * Call before match writes and when the app returns to the foreground.
 */
export async function ensureFreshSession(): Promise<SessionRefreshResult> {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
  if (sessionError) return { ok: false, error: sessionError.message }

  const session = sessionData.session
  if (!session?.access_token) return { ok: false, error: 'Not signed in' }

  if (!sessionNeedsRefresh(session.expires_at)) {
    return { ok: true, accessToken: session.access_token }
  }

  const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession()
  if (refreshError) return { ok: false, error: refreshError.message }
  if (!refreshed.session?.access_token) return { ok: false, error: 'Not signed in' }
  return { ok: true, accessToken: refreshed.session.access_token }
}
