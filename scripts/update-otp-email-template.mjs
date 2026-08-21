#!/usr/bin/env node
/**
 * Update Supabase Auth "Magic Link" email template to send a 6-digit OTP
 * ({{ .Token }}) for PWA login without opening a magic link.
 *
 * Requires a personal access token from https://supabase.com/dashboard/account/tokens
 *
 * Usage:
 *   SUPABASE_ACCESS_TOKEN=sbp_... npm run auth:otp-template
 *   # or put SUPABASE_ACCESS_TOKEN in .env
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

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

loadEnvFile()

const PROJECT_REF =
  process.env.SUPABASE_PROJECT_REF ||
  (process.env.VITE_SUPABASE_URL || '').match(/https:\/\/([a-z0-9]+)\.supabase\.co/i)?.[1]

const ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN

const SUBJECT = 'Your Virginia Velocity Game Day login code'
const CONTENT = `<h2>Your login code</h2>
<p>Enter this 6-digit code in the Game Day app to sign in:</p>
<p style="font-size:28px;font-weight:700;letter-spacing:6px;">{{ .Token }}</p>
<p>This code expires shortly. If you did not request it, you can ignore this email.</p>
`

async function main() {
  if (!ACCESS_TOKEN) {
    console.error(
      'Missing SUPABASE_ACCESS_TOKEN.\nCreate one at https://supabase.com/dashboard/account/tokens and set it in .env or the environment.',
    )
    process.exit(1)
  }
  if (!PROJECT_REF) {
    console.error('Missing project ref (SUPABASE_PROJECT_REF or VITE_SUPABASE_URL).')
    process.exit(1)
  }

  const url = `https://api.supabase.com/v1/projects/${PROJECT_REF}/config/auth`
  const res = await fetch(url, {
    method: 'patch',
    headers: {
      Authorization: `Bearer ${ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      mailer_subjects_magic_link: SUBJECT,
      mailer_templates_magic_link_content: CONTENT,
    }),
  })

  const text = await res.text()
  if (!res.ok) {
    console.error(`Failed (${res.status}):`, text)
    process.exit(1)
  }

  console.log(`Updated Magic Link / OTP email template for project ${PROJECT_REF}.`)
  console.log(`Subject: ${SUBJECT}`)
  console.log('Body now includes {{ .Token }} for 6-digit codes.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
