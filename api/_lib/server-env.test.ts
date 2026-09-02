import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import {
  assertNoClientLeakedSecrets,
  requireServiceRoleKey,
} from './server-env'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

const LEAK_KEYS = [
  'VITE_SUPABASE_SERVICE_ROLE_KEY',
  'VITE_VAPID_PRIVATE_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
] as const

afterEach(() => {
  for (const key of LEAK_KEYS) delete process.env[key]
})

describe('assertNoClientLeakedSecrets', () => {
  it('allows a clean env', () => {
    expect(() => assertNoClientLeakedSecrets()).not.toThrow()
  })

  it('rejects a VITE_ prefixed service role key', () => {
    process.env.VITE_SUPABASE_SERVICE_ROLE_KEY = 'leak'
    expect(() => assertNoClientLeakedSecrets()).toThrow(/server-only/)
  })

  it('rejects a VITE_ prefixed VAPID private key', () => {
    process.env.VITE_VAPID_PRIVATE_KEY = 'leak'
    expect(() => assertNoClientLeakedSecrets()).toThrow(/VAPID_PRIVATE_KEY/)
  })
})

describe('requireServiceRoleKey', () => {
  it('reads only SUPABASE_SERVICE_ROLE_KEY', () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'sr-key'
    expect(requireServiceRoleKey()).toBe('sr-key')
  })

  it('does not treat a VITE_ service role as the server secret', () => {
    process.env.VITE_SUPABASE_SERVICE_ROLE_KEY = 'sr-key'
    expect(() => requireServiceRoleKey()).toThrow(/server-only/)
  })
})

describe('env example safety', () => {
  it('does not assign a VITE_ service role key', () => {
    const example = readFileSync(path.join(repoRoot, '.env.example'), 'utf8')
    expect(example).not.toMatch(/^VITE_SUPABASE_SERVICE_ROLE_KEY=/m)
    expect(example).toMatch(/SUPABASE_SERVICE_ROLE_KEY=/)
  })
})
