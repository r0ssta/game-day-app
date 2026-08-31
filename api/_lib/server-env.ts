/**
 * Server-only env access. Never import this module from `src/` —
 * Vite would bundle it into the browser.
 */

function read(name: string): string {
  return (process.env[name] || '').trim()
}

/** Fail closed if a secret was accidentally given a VITE_ prefix. */
export function assertNoClientLeakedSecrets(): void {
  if (read('VITE_SUPABASE_SERVICE_ROLE_KEY')) {
    throw new Error(
      'VITE_SUPABASE_SERVICE_ROLE_KEY must not be set. Service role keys are server-only.',
    )
  }
  if (read('VITE_VAPID_PRIVATE_KEY')) {
    throw new Error(
      'VITE_VAPID_PRIVATE_KEY must not be set. The VAPID private key is server-only (VAPID_PRIVATE_KEY).',
    )
  }
}

export function requirePublishableSupabaseEnv(): { url: string; key: string } {
  assertNoClientLeakedSecrets()
  const url = read('VITE_SUPABASE_URL') || read('SUPABASE_URL')
  const key =
    read('VITE_SUPABASE_PUBLISHABLE_KEY') ||
    read('SUPABASE_ANON_KEY') ||
    read('SUPABASE_PUBLISHABLE_KEY')
  if (!url || !key) {
    throw new Error(
      'Missing Supabase URL or publishable/anon key on the server (VITE_SUPABASE_URL + VITE_SUPABASE_PUBLISHABLE_KEY).',
    )
  }
  return { url, key }
}

/**
 * Service role is not used by match orchestration (user JWT + publishable key).
 * Call this only from admin/push paths that must bypass RLS.
 */
export function requireServiceRoleKey(): string {
  assertNoClientLeakedSecrets()
  const key = read('SUPABASE_SERVICE_ROLE_KEY')
  if (!key) {
    throw new Error(
      'Missing SUPABASE_SERVICE_ROLE_KEY. This secret is server-only and must not be prefixed with VITE_.',
    )
  }
  return key
}

export function requireVapidConfig(): {
  publicKey: string
  privateKey: string
  subject: string
} {
  assertNoClientLeakedSecrets()
  const publicKey = read('VITE_VAPID_PUBLIC_KEY') || read('VAPID_PUBLIC_KEY')
  const privateKey = read('VAPID_PRIVATE_KEY')
  const subject = read('VAPID_SUBJECT') || 'mailto:admin@virginiavelocity.com'
  if (!publicKey) {
    throw new Error('Missing VAPID public key (VITE_VAPID_PUBLIC_KEY or VAPID_PUBLIC_KEY).')
  }
  if (!privateKey) {
    throw new Error('Missing VAPID_PRIVATE_KEY (server-only).')
  }
  return { publicKey, privateKey, subject }
}
