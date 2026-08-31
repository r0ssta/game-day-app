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
  const { data, error } = await supabase
    .from('matches')
    .select(
      'id, team_id, status, home_score, away_score, half_length, opponent, period_clock_started',
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

  return { match: data as MatchAccessRow }
}
