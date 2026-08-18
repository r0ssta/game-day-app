/**
 * Canonical URL used for Supabase Auth magic-link / OTP redirects.
 *
 * Local Vite always uses the current origin so links return to this machine.
 * Production builds prefer VITE_SITE_URL so emails never fall back to a
 * localhost Site URL misconfiguration. Keep production + localhost in
 * Supabase Auth → URL Configuration → Redirect URLs.
 */
export function getAuthRedirectUrl(): string {
  if (import.meta.env.DEV && typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin
  }

  const configured = (import.meta.env.VITE_SITE_URL as string | undefined)?.trim()
  if (configured) {
    return configured.replace(/\/$/, '')
  }
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin
  }
  // Production fallback when env is missing (Vercel deploy of this app).
  return 'https://game-day-app-chvm.vercel.app'
}
