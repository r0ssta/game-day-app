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

export async function createE2eTestMatch(
  supabase: SupabaseClient,
): Promise<{ matchId: string } | { skip: string }> {
  const [{ data: team, error: teamError }, { data: season, error: seasonError }] =
    await Promise.all([
      supabase.from('teams').select('id').eq('active_status', true).limit(1),
      supabase.from('seasons').select('id').eq('status', 'active').limit(1),
    ])
  if (teamError) return { skip: `Could not load a team: ${teamError.message}` }
  if (seasonError) return { skip: `Could not load an active season: ${seasonError.message}` }
  const teamId = team?.[0]?.id as string | undefined
  const seasonId = season?.[0]?.id as string | undefined
  if (!teamId) return { skip: 'No active team visible to this staff user' }
  if (!seasonId) return { skip: 'No active season visible to this staff user' }

  const payload: Record<string, unknown> = {
    team_id: teamId,
    season_id: seasonId,
    opponent: 'E2E Opponent',
    location: 'e2e',
    location_type: 'home',
    is_test: true,
    status: 'live',
    half_length: 30,
    period_length: 30,
    clock_seconds: 1800,
    home_score: 0,
    away_score: 0,
  }

  const { data, error } = await supabase.from('matches').insert(payload).select('id').single()
  if (error || !data?.id) {
    return { skip: `Could not create test match: ${error?.message || 'no id'}` }
  }
  return { matchId: data.id as string }
}

export async function deleteE2eTestMatch(supabase: SupabaseClient, matchId: string): Promise<void> {
  await supabase.from('match_events').delete().eq('match_id', matchId)
  await supabase.from('match_stats').delete().eq('match_id', matchId)
  await supabase.from('matches').delete().eq('id', matchId)
}
