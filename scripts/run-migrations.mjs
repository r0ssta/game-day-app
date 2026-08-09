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

  SUPABASE_DB_URL=postgresql://postgres.[project-ref]:[password]@db.[project-ref].supabase.co:5432/postgres

Find it in Supabase Dashboard:
  Project Settings → Database → Connection string → URI → Direct connection

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
  const client = new pg.Client({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false },
  })

  await client.connect()

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

main().catch((error) => {
  console.error('\nMigration failed:', error instanceof Error ? error.message : error)
  process.exit(1)
})
