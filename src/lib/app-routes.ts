/** Staff login + dashboard stay at `/` so existing home-screen icons keep working. */
export const COACH_APP_PATH = '/'
/** Public marketing splash — not the coach root. */
export const LANDING_PATH = '/waitlist'
/** Staff-only Player Impact report. Hidden from Parent Hub (`/hub/:slug`). */
export const IMPACT_REPORT_PATH = '/impact'

function normalizePathname(pathname: string): string {
  const trimmed = pathname.trim()
  if (!trimmed || trimmed === '/') return '/'
  return trimmed.replace(/\/+$/, '') || '/'
}

export type CoachRouteParams = {
  teamId: string | null
  matchId: string | null
  screen: 'team' | 'match' | 'impact' | null
}

const COACH_TEAM_IMPACT_RE = /^\/coach\/teams\/([^/]+)\/impact$/i
const COACH_SESSION_RE = /^\/coach\/teams\/([^/]+)(?:\/matches\/([^/]+))?$/i

function decodeRouteSegment(value: string | undefined): string | null {
  if (!value) return null
  try {
    const decoded = decodeURIComponent(value).trim()
    return decoded.length > 0 ? decoded : null
  } catch {
    return null
  }
}

/**
 * Pathname params for `/coach/teams/:teamId/matches/:matchId`.
 * Source of truth for the active staff team/match — not localStorage or context.
 */
export function parseCoachRoute(pathname: string): CoachRouteParams {
  const path = normalizePathname(pathname)
  const impactWithTeam = path.match(COACH_TEAM_IMPACT_RE)
  if (impactWithTeam?.[1]) {
    return {
      teamId: decodeRouteSegment(impactWithTeam[1]),
      matchId: null,
      screen: 'impact',
    }
  }
  if (path === IMPACT_REPORT_PATH) {
    return { teamId: null, matchId: null, screen: 'impact' }
  }
  const session = path.match(COACH_SESSION_RE)
  if (!session) return { teamId: null, matchId: null, screen: null }
  const teamId = decodeRouteSegment(session[1])
  const matchId = decodeRouteSegment(session[2])
  return {
    teamId,
    matchId,
    screen: matchId ? 'match' : 'team',
  }
}

export function coachTeamPath(teamId: string): string {
  return `/coach/teams/${teamId}`
}

export function coachMatchPath(teamId: string, matchId: string): string {
  return `/coach/teams/${teamId}/matches/${matchId}`
}

export function coachImpactPath(teamId?: string | null): string {
  return teamId ? `/coach/teams/${teamId}/impact` : IMPACT_REPORT_PATH
}

/** True for the test waitlist page only. */
export function isLandingPath(pathname: string): boolean {
  return normalizePathname(pathname) === LANDING_PATH
}

/** True for the coach-only Player Impact report. */
export function isImpactReportPath(pathname: string): boolean {
  const path = normalizePathname(pathname)
  return path === IMPACT_REPORT_PATH || COACH_TEAM_IMPACT_RE.test(path)
}

function applyHistoryPath(path: string, mode: 'push' | 'replace'): void {
  if (typeof window === 'undefined') return
  const next = path.startsWith('/') ? path : `/${path}`
  const current = `${window.location.pathname}${window.location.search}${window.location.hash}`
  if (current === next) return
  if (mode === 'replace') window.history.replaceState(null, '', next)
  else window.history.pushState(null, '', next)
  window.dispatchEvent(new PopStateEvent('popstate'))
}

/** SPA navigation that the root route listener already watches via `popstate`. */
export function navigateApp(path: string): void {
  applyHistoryPath(path, 'push')
}

/** Same as `navigateApp` but replaces the current history entry (bootstraps, redirects). */
export function replaceApp(path: string): void {
  applyHistoryPath(path, 'replace')
}
