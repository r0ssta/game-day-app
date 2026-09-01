import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

function loadEnvFiles() {
  for (const name of ['.env', '.env.local']) {
    const envPath = path.join(ROOT, name)
    if (!fs.existsSync(envPath)) continue
    for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const index = trimmed.indexOf('=')
      if (index <= 0) continue
      const key = trimmed.slice(0, index).trim()
      let value = trimmed.slice(index + 1).trim()
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1)
      }
      if (process.env[key] === undefined) process.env[key] = value
    }
  }
}

loadEnvFiles()

function supabaseEnv() {
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
  const key =
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.SUPABASE_PUBLISHABLE_KEY
  return { url, key }
}

export function staffE2eSkipReason(): string | null {
  const { url, key } = supabaseEnv()
  if (!url || !key) return 'Supabase URL/key not configured'
  if (process.env.E2E_STAFF_ACCESS_TOKEN?.trim()) return null
  if (process.env.E2E_STAFF_EMAIL?.trim() && process.env.E2E_STAFF_PASSWORD) return null
  return 'Set E2E_STAFF_EMAIL + E2E_STAFF_PASSWORD, or E2E_STAFF_ACCESS_TOKEN'
}

/** Locally skip; in CI a missing staff session is a failed deploy check. */
export function skipUnlessStaffE2e(
  test: { skip: (condition?: boolean, description?: string) => void },
  reason: string,
): void {
  if (process.env.CI) {
    throw new Error(`Staff e2e required in CI: ${reason}`)
  }
  test.skip(true, reason)
}

export async function staffAccessToken(): Promise<string> {
  const preset = process.env.E2E_STAFF_ACCESS_TOKEN?.trim()
  if (preset) return preset

  const { url, key } = supabaseEnv()
  if (!url || !key) throw new Error('Supabase env not configured')
  const email = process.env.E2E_STAFF_EMAIL?.trim()
  const password = process.env.E2E_STAFF_PASSWORD
  if (!email || !password) throw new Error('Staff e2e credentials not configured')

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error || !data.session?.access_token) {
    throw new Error(error?.message || 'Staff password sign-in failed')
  }
  return data.session.access_token
}

export function staffSupabase(accessToken: string): SupabaseClient {
  const { url, key } = supabaseEnv()
  if (!url || !key) throw new Error('Supabase env not configured')
  return createClient(url, key, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

export type E2eTestPlayer = { id: string; label: string }

export type E2eTestMatch = {
  matchId: string
  teamId: string
  teamName: string
  teamSlug: string
  seasonId: string
  starter: E2eTestPlayer
  bench: E2eTestPlayer
}

async function resolveE2eTeam(
  supabase: SupabaseClient,
): Promise<{ id: string; name: string; slug: string } | { skip: string }> {
  const teamId = process.env.E2E_TEAM_ID?.trim()
  const teamSlug = process.env.E2E_TEAM_SLUG?.trim()
  if (!teamId && !teamSlug) {
    return {
      skip: 'Set E2E_TEAM_ID or E2E_TEAM_SLUG so writes do not hit the first active team',
    }
  }

  let query = supabase.from('teams').select('id, name, slug').eq('active_status', true)
  query = teamId ? query.eq('id', teamId) : query.eq('slug', teamSlug)
  const { data, error } = await query.maybeSingle()
  if (error) return { skip: `Could not load e2e team: ${error.message}` }
  if (!data?.id) {
    return {
      skip: teamId
        ? `No active team for E2E_TEAM_ID=${teamId}`
        : `No active team for E2E_TEAM_SLUG=${teamSlug}`,
    }
  }
  return {
    id: data.id as string,
    name: String(data.name || 'E2E Team'),
    slug: String(data.slug || teamSlug || ''),
  }
}

async function resolveE2eSeason(
  supabase: SupabaseClient,
): Promise<{ id: string } | { skip: string }> {
  const seasonId = process.env.E2E_SEASON_ID?.trim()
  if (seasonId) {
    const { data, error } = await supabase
      .from('seasons')
      .select('id')
      .eq('id', seasonId)
      .maybeSingle()
    if (error) return { skip: `Could not load E2E_SEASON_ID: ${error.message}` }
    if (!data?.id) return { skip: `No season for E2E_SEASON_ID=${seasonId}` }
    return { id: data.id as string }
  }

  const { data, error } = await supabase.from('seasons').select('id').eq('status', 'active').limit(1)
  if (error) return { skip: `Could not load an active season: ${error.message}` }
  const id = data?.[0]?.id as string | undefined
  if (!id) return { skip: 'No active season visible to this staff user' }
  return { id }
}

async function resolveE2ePlayers(
  supabase: SupabaseClient,
  teamId: string,
  seasonId: string,
): Promise<E2eTestPlayer[] | { skip: string }> {
  const { data, error } = await supabase
    .from('season_rosters')
    .select('player_id, primary_jersey_number')
    .eq('team_id', teamId)
    .eq('season_id', seasonId)
    .limit(5)
  if (error) return { skip: `Could not load season roster: ${error.message}` }
  const rows = (data ?? []).filter((row) => typeof row.player_id === 'string' && row.player_id)
  if (rows.length < 2) {
    return { skip: 'E2E team needs at least 2 players on the active season roster' }
  }
  return rows.map((row, index) => ({
    id: row.player_id as string,
    label:
      typeof row.primary_jersey_number === 'number'
        ? `#${row.primary_jersey_number} E2E`
        : `E2E ${index + 1}`,
  }))
}

export async function createE2eTestMatch(
  supabase: SupabaseClient,
): Promise<E2eTestMatch | { skip: string }> {
  const team = await resolveE2eTeam(supabase)
  if ('skip' in team) return team
  const season = await resolveE2eSeason(supabase)
  if ('skip' in season) return season
  const players = await resolveE2ePlayers(supabase, team.id, season.id)
  if ('skip' in players) return players

  const payload: Record<string, unknown> = {
    team_id: team.id,
    season_id: season.id,
    opponent: 'E2E Opponent',
    location: 'e2e',
    date: new Date().toISOString().slice(0, 10),
    is_test: true,
    status: 'live',
    half_length: 30,
    period_length: 30,
    total_periods: 2,
    current_period: 1,
    period: '1st',
    period_clock_started: false,
    clock_seconds: 1800,
    home_score: 0,
    away_score: 0,
  }

  const { data, error } = await supabase.from('matches').insert(payload).select('id').single()
  if (error || !data?.id) {
    return { skip: `Could not create test match: ${error?.message || 'no id'}` }
  }
  const matchId = data.id as string

  const stats = players.map((player, index) => ({
    match_id: matchId,
    player_id: player.id,
    total_minutes: 0,
    impact_score: 0,
    match_status: 'bench',
    match_position: index === 0 ? 'ST' : 'CM',
    total_seconds_played: 0,
    subbed_in_at: null,
    is_first_half_starter: false,
    is_second_half_starter: false,
    attending: true,
    plus_minus: 0,
  }))
  const { error: statsError } = await supabase.from('match_stats').insert(stats)
  if (statsError) {
    await deleteE2eTestMatch(supabase, matchId)
    return { skip: `Could not seed match_stats: ${statsError.message}` }
  }

  return {
    matchId,
    teamId: team.id,
    teamName: team.name,
    teamSlug: team.slug,
    seasonId: season.id,
    starter: players[0]!,
    bench: players[1]!,
  }
}

export async function deleteE2eTestMatch(supabase: SupabaseClient, matchId: string): Promise<void> {
  await supabase.from('match_reviews').delete().eq('match_id', matchId)
  await supabase.from('match_events').delete().eq('match_id', matchId)
  await supabase.from('match_stats').delete().eq('match_id', matchId)
  await supabase.from('matches').delete().eq('id', matchId)
}
