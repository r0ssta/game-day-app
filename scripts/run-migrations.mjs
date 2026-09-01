#!/usr/bin/env node
/**
 * Apply pending Supabase SQL migrations using a direct Postgres connection.
 *
 * Usage:
 *   npm run db:migrate          # apply pending migrations
 *   npm run db:migrate:status   # list applied vs pending
 *   npm run db:migrate:baseline # mark all manifest migrations as applied (existing DBs)
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const MANIFEST_PATH = path.join(ROOT, 'supabase', 'migrations.manifest.json')

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
    if (process.env[key] === undefined) {
      process.env[key] = value
    }
  }
}

function getDatabaseUrl() {
  return process.env.SUPABASE_DB_URL || process.env.DATABASE_URL || null
}

/**
 * Direct db.<ref>.supabase.co hosts are often IPv6-only. Many local networks
 * cannot reach them, so also try the Supabase session pooler (IPv4).
 */
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
  const regions = [
    preferred,
    'us-east-1',
    'us-east-2',
    'us-west-1',
    'us-west-2',
    'eu-west-1',
    'eu-west-2',
    'eu-central-1',
    'ap-southeast-1',
    'ap-northeast-1',
    'ca-central-1',
    'sa-east-1',
  ].filter((region, index, all) => all.indexOf(region) === index)

  return regions.flatMap((region) => {
    const session = new URL(`postgresql://aws-0-${region}.pooler.supabase.com:5432/${database}`)
    session.username = `postgres.${projectRef}`
    session.password = password
    if (parsed.search) session.search = parsed.search

    const txn = new URL(`postgresql://aws-0-${region}.pooler.supabase.com:6543/${database}`)
    txn.username = `postgres.${projectRef}`
    txn.password = password
    if (parsed.search) txn.search = parsed.search

    return [txn.toString(), session.toString()]
  })
}

function connectionCandidates(databaseUrl) {
  const urls = [databaseUrl]
  for (const pooler of buildPoolerFallbackUrls(databaseUrl)) {
    if (!urls.includes(pooler)) urls.push(pooler)
  }
  return urls
}

function redactDatabaseUrl(databaseUrl) {
  try {
    const parsed = new URL(databaseUrl)
    if (parsed.password) parsed.password = '***'
    return parsed.toString()
  } catch {
    return '(invalid database url)'
  }
}

function isRetryableConnectionError(error) {
  const code = typeof error?.code === 'string' ? error.code : ''
  const message = error instanceof Error ? error.message : String(error)
  return (
    code === 'ENOTFOUND' ||
    code === 'ENETUNREACH' ||
    code === 'EHOSTUNREACH' ||
    code === 'ECONNREFUSED' ||
    code === 'ETIMEDOUT' ||
    /tenant\/user .* not found/i.test(message) ||
    /no route to host/i.test(message) ||
    /getaddrinfo/i.test(message)
  )
}

async function connectWithFallback(databaseUrl) {
  const candidates = connectionCandidates(databaseUrl)
  let lastError = null

  for (const [index, candidate] of candidates.entries()) {
    const client = new pg.Client({
      connectionString: candidate,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 10_000,
    })

    try {
      await client.connect()
      if (index > 0) {
        console.log(
          `Direct DB host unreachable; connected via pooler fallback (${redactDatabaseUrl(candidate)}).`,
        )
      }
      return client
    } catch (error) {
      lastError = error
      try {
        await client.end()
      } catch {
        // ignore cleanup errors
      }
      if (!isRetryableConnectionError(error)) break
    }
  }

  throw lastError ?? new Error('Unable to connect to Postgres')
}

function loadManifest() {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'))
  if (!Array.isArray(manifest.migrations) || manifest.migrations.length === 0) {
    throw new Error('supabase/migrations.manifest.json must include a migrations array')
  }
  return manifest.migrations
}

async function ensureMigrationTable(client) {
  await client.query(`
    create schema if not exists app_meta;

    create table if not exists app_meta.schema_migrations (
      filename text primary key,
      applied_at timestamptz not null default now()
    );
  `)
}

async function fetchApplied(client) {
  const { rows } = await client.query('select filename from app_meta.schema_migrations order by filename')
  return new Set(rows.map((row) => row.filename))
}

function printSetupHelp() {
  console.error(`
Missing database connection string.

Add this to .env (not committed to git):

  SUPABASE_DB_URL=postgresql://postgres.[project-ref]:[password]@aws-0-us-east-2.pooler.supabase.com:6543/postgres

Find it in Supabase Dashboard:
  Project Settings → Database → Connection string → URI (mode: Transaction, port 6543)

Direct db.*:5432 is IPv6-only. Session pooler (:5432 on *.pooler.supabase.com) is for
long-lived clients. Vercel functions should not use this URL at all — they use the
HTTPS Data API (VITE_SUPABASE_URL).

Then run:
  npm run db:migrate:baseline   # once, if your DB already has these changes
  npm run db:migrate              # apply any new pending migrations
`)
}

async function main() {
  loadEnvFile()

  const args = new Set(process.argv.slice(2))
  const baseline = args.has('--baseline')
  const statusOnly = args.has('--status')

  const databaseUrl = getDatabaseUrl()
  if (!databaseUrl) {
    printSetupHelp()
    process.exit(1)
  }

  const migrations = loadManifest()
  const client = await connectWithFallback(databaseUrl)

  try {
    await ensureMigrationTable(client)
    const applied = await fetchApplied(client)

    if (statusOnly) {
      console.log('Migration status:\n')
      for (const file of migrations) {
        console.log(`${applied.has(file) ? '✓' : '○'} ${file}`)
      }
      const pending = migrations.filter((file) => !applied.has(file))
      console.log(`\n${pending.length} pending, ${applied.size} recorded`)
      return
    }

    if (baseline) {
      let marked = 0
      for (const file of migrations) {
        if (applied.has(file)) continue
        await client.query('insert into app_meta.schema_migrations (filename) values ($1)', [file])
        marked += 1
      }
      console.log(marked === 0 ? 'Baseline already up to date.' : `Baselined ${marked} migration(s).`)
      return
    }

    let ran = 0
    for (const file of migrations) {
      if (applied.has(file)) continue

      const filePath = path.join(ROOT, file)
      if (!fs.existsSync(filePath)) {
        throw new Error(`Migration file not found: ${file}`)
      }

      const sql = fs.readFileSync(filePath, 'utf8')
      console.log(`Applying ${file}...`)

      await client.query('begin')
      try {
        await client.query(sql)
        await client.query('insert into app_meta.schema_migrations (filename) values ($1)', [file])
        await client.query('commit')
        ran += 1
      } catch (error) {
        await client.query('rollback')
        throw error
      }
    }

    if (ran > 0) {
      await client.query(`notify pgrst, 'reload schema';`)
      console.log(`Applied ${ran} migration(s) and reloaded PostgREST schema.`)
    } else {
      console.log('No pending migrations.')
    }
  } finally {
    await client.end()
  }
}

const isDirectRun =
  process.argv[1] != null &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (isDirectRun) {
  main().catch((error) => {
    console.error('\nMigration failed:', error instanceof Error ? error.message : error)
    process.exit(1)
  })
}
