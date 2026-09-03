/** Staff dashboard + login live behind these paths. Public marketing is `/`. */
export const COACH_APP_PATH = '/coach'
export const COACH_APP_ALIASES = ['/coach', '/admin'] as const

function normalizePathname(pathname: string): string {
  const trimmed = pathname.trim()
  if (!trimmed || trimmed === '/') return '/'
  return trimmed.replace(/\/+$/, '') || '/'
}

/** True for `/coach`, `/admin`, and nested staff paths. */
export function isCoachAppPath(pathname: string): boolean {
  const path = normalizePathname(pathname)
  return COACH_APP_ALIASES.some((alias) => path === alias || path.startsWith(`${alias}/`))
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

export function withCoachPath(origin: string): string {
  return `${origin.replace(/\/$/, '')}${COACH_APP_PATH}`
}
