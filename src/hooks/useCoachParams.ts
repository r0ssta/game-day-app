import { useEffect, useState } from 'react'
import { parseCoachRoute, type CoachRouteParams } from '@/lib/app-routes'

/**
 * `useParams()` for staff session routes (`/coach/teams/:teamId/matches/:matchId`).
 * Path routing stays pathname-based — this is the URL source of truth.
 */
export function useCoachParams(): CoachRouteParams {
  const [params, setParams] = useState<CoachRouteParams>(() =>
    parseCoachRoute(typeof window === 'undefined' ? '/' : window.location.pathname),
  )

  useEffect(() => {
    const sync = () => setParams(parseCoachRoute(window.location.pathname))
    sync()
    window.addEventListener('popstate', sync)
    return () => window.removeEventListener('popstate', sync)
  }, [])

  return params
}

/** React-Router-style alias used by match/roster hooks. */
export function useParams(): Pick<CoachRouteParams, 'teamId' | 'matchId'> {
  const { teamId, matchId } = useCoachParams()
  return { teamId, matchId }
}
