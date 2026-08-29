#!/usr/bin/env node
/**
 * Correct U13 Maroon final score from 8-1 to 8-0 (remove disallowed opponent goal).
 *
 * Usage:
 *   node scripts/fix-u13-maroon-final-score.mjs
 *
 * Requires SUPABASE_DB_URL (or DATABASE_URL) in .env
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')

function loadEnvFile() {
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
  const regions = ['us-east-1', 'us-east-2', 'us-west-2']
  return regions.map((region) => {
    const session = new URL(`postgresql://aws-0-${region}.pooler.supabase.com:5432/${database}`)
    session.username = `postgres.${projectRef}`
    session.password = password
    return session.toString()
  })
}

async function connect(databaseUrl) {
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
  throw lastError ?? new Error('Could not connect to database')
}

async function main() {
  loadEnvFile()
  const databaseUrl = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL
  if (!databaseUrl) {
    console.error('Missing SUPABASE_DB_URL or DATABASE_URL in .env')
    process.exit(1)
  }

  const client = await connect(databaseUrl)
  try {
    const sql = fs.readFileSync(
      path.join(ROOT, 'supabase-fix-u13-maroon-final-score-migration.sql'),
      'utf8',
    )
    await client.query(sql)
    console.log('U13 Maroon score fix applied (or already corrected).')
  } finally {
    await client.end()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
