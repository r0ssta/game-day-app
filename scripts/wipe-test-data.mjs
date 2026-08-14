#!/usr/bin/env node
/**
 * One-shot wipe of club test data.
 * Keeps auth users, profiles, and staff roles (including directors).
 *
 * Usage:
 *   node scripts/wipe-test-data.mjs --confirm
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')

function loadEnvFile() {
  const envPath = path.join(ROOT, '.env')
  if (!fs.existsSync(envPath)) return
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

function getDatabaseUrl() {
  return process.env.SUPABASE_DB_URL || process.env.DATABASE_URL || null
}

function buildPoolerFallbackUrls(databaseUrl) {
  let parsed
  try {
    parsed = new URL(databaseUrl)
  } catch {
    return []
  }
  const hostMatch = parsed.hostname.match(/^db\.([a-z0-9]+)\.supabase\.co$/i)
  if (!hostMatch) return []
  const projectRef = hostMatch[1]
  const password = decodeURIComponent(parsed.password || '')
  const database = parsed.pathname.replace(/^\//, '') || 'postgres'
  const preferred = process.env.SUPABASE_POOLER_REGION || 'us-east-1'
  const regions = [preferred, 'us-east-1', 'us-east-2', 'us-west-2'].filter(
    (region, index, all) => all.indexOf(region) === index,
  )
  return regions.flatMap((region) => {
    const session = new URL(`postgresql://aws-0-${region}.pooler.supabase.com:5432/${database}`)
    session.username = `postgres.${projectRef}`
    session.password = password
    return [session.toString()]
  })
}

async function connectWithFallback(databaseUrl) {
  const candidates = [databaseUrl, ...buildPoolerFallbackUrls(databaseUrl)]
  let lastError = null
  for (const candidate of candidates) {
    const client = new pg.Client({
      connectionString: candidate,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 10_000,
    })
    try {
      await client.connect()
      return client
    } catch (error) {
      lastError = error
      try {
        await client.end()
      } catch {
        // ignore
      }
    }
  }
  throw lastError ?? new Error('Unable to connect to Postgres')
}

const WIPE_SQL = `
begin;

-- Domain / match history
truncate table
  public.match_events,
  public.match_stats,
  public.match_reviews,
  public.match_stat_trackers,
  public.matches,
  public.season_rosters,
  public.lineup_presets,
  public.players,
  public.team_members,
  public.teams,
  public.coaches,
  public.seasons,
  public.staff_invites
restart identity cascade;

-- Fresh empty active season so the app has a default
insert into public.seasons (name, status, starts_on, ends_on)
values (
  '2026 Season',
  'active',
  date_trunc('month', current_date)::date,
  (date_trunc('month', current_date) + interval '8 months')::date
);

commit;
`

const VERIFY_SQL = `
select
  (select count(*)::int from public.teams) as teams,
  (select count(*)::int from public.players) as players,
  (select count(*)::int from public.matches) as matches,
  (select count(*)::int from public.seasons) as seasons,
  (select count(*)::int from public.user_roles where role = 'director') as directors,
  (select string_agg(coalesce(p.email, ur.user_id::text), ', ' order by p.email)
     from public.user_roles ur
     left join public.profiles p on p.id = ur.user_id
     where ur.role = 'director') as director_emails;
`

async function main() {
  loadEnvFile()
  if (!process.argv.includes('--confirm')) {
    console.error('Refusing to wipe without --confirm')
    console.error('Usage: node scripts/wipe-test-data.mjs --confirm')
    process.exit(1)
  }

  const databaseUrl = getDatabaseUrl()
  if (!databaseUrl) {
    throw new Error('Set SUPABASE_DB_URL or DATABASE_URL in .env')
  }

  const client = await connectWithFallback(databaseUrl)
  try {
    const before = await client.query(VERIFY_SQL)
    console.log('Before:', before.rows[0])

    await client.query(WIPE_SQL)

    const after = await client.query(VERIFY_SQL)
    console.log('After:', after.rows[0])
    console.log('Wipe complete. Directors preserved:', after.rows[0].director_emails)
  } finally {
    await client.end()
  }
}

main().catch((error) => {
  console.error('Wipe failed:', error instanceof Error ? error.message : error)
  process.exit(1)
})
