import type { SupabaseClient } from '@supabase/supabase-js'

export type MatchAccessRow = {
  id: string
  team_id: string
  status: string
  home_score: number
  away_score: number
  half_length: number
  opponent: string
  period_clock_started: boolean
  is_test: boolean
}

const MATCH_ACCESS_TTL_MS = 60_000
const matchAccessCache = new Map<string, { match: MatchAccessRow; at: number }>()

function readCachedMatchAccess(matchId: string): MatchAccessRow | null {
  const hit = matchAccessCache.get(matchId)
  if (!hit || Date.now() - hit.at >= MATCH_ACCESS_TTL_MS) {
    matchAccessCache.delete(matchId)
    return null
  }
  return hit.match
}

function rememberMatchAccess(match: MatchAccessRow): void {
  matchAccessCache.set(match.id, { match, at: Date.now() })
  if (matchAccessCache.size <= 200) return
  const now = Date.now()
  for (const [key, entry] of matchAccessCache) {
    if (now - entry.at >= MATCH_ACCESS_TTL_MS) matchAccessCache.delete(key)
  }
}

/**
 * Verify the authenticated staff user can mutate this match.
 * Staff RLS already gates table access; this confirms the match exists and
 * returns it for orchestration.
 */
export async function requireMatchAccess(
  supabase: SupabaseClient,
  matchId: string,
): Promise<{ match: MatchAccessRow } | { error: string; status: number }> {
  const cached = readCachedMatchAccess(matchId)
  if (cached) return { match: cached }

  const { data, error } = await supabase
    .from('matches')
    .select(
      'id, team_id, status, home_score, away_score, half_length, opponent, period_clock_started, is_test',
    )
    .eq('id', matchId)
    .maybeSingle()

  if (error) {
    console.error('[requireMatchAccess]', error)
    return { error: 'Failed to load match', status: 500 }
  }
  if (!data) {
    return { error: 'Match not found or access denied', status: 404 }
  }

  const match: MatchAccessRow = {
    ...(data as Omit<MatchAccessRow, 'is_test'>),
    is_test: Boolean((data as { is_test?: boolean }).is_test),
  }
  rememberMatchAccess(match)
  return { match }
}
