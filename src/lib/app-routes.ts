/** Staff login + dashboard stay at `/` so existing home-screen icons keep working. */
export const COACH_APP_PATH = '/'
/** Public marketing splash — not the coach root. */
export const LANDING_PATH = '/waitlist'

function normalizePathname(pathname: string): string {
  const trimmed = pathname.trim()
  if (!trimmed || trimmed === '/') return '/'
  return trimmed.replace(/\/+$/, '') || '/'
}

/** True for the test waitlist page only. */
export function isLandingPath(pathname: string): boolean {
  return normalizePathname(pathname) === LANDING_PATH
}

/** SPA navigation that the root route listener already watches via `popstate`. */
export function navigateApp(path: string): void {
  if (typeof window === 'undefined') return
  const next = path.startsWith('/') ? path : `/${path}`
  const current = `${window.location.pathname}${window.location.search}${window.location.hash}`
  if (current === next) return
  window.history.pushState(null, '', next)
  window.dispatchEvent(new PopStateEvent('popstate'))
}
