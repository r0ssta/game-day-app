import type { VercelRequest, VercelResponse } from '@vercel/node'
import { corsPreflight } from './auth.js'

const WINDOW_MS = 10_000
const MAX_WRITES = 20
const MAX_KEYS = 4_000

const buckets = new Map<string, number[]>()

function clientIp(req: VercelRequest): string {
  const forwarded = req.headers['x-forwarded-for']
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0]?.trim() || 'unknown'
  }
  if (Array.isArray(forwarded) && forwarded[0]) {
    return forwarded[0].split(',')[0]?.trim() || 'unknown'
  }
  const realIp = req.headers['x-real-ip']
  if (typeof realIp === 'string' && realIp.trim()) return realIp.trim()
  return req.socket?.remoteAddress || 'unknown'
}

function bearerSubject(req: VercelRequest): string | null {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) return null
  const token = header.slice('Bearer '.length).trim()
  const payload = token.split('.')[1]
  if (!payload) return null
  try {
    const json = Buffer.from(payload, 'base64url').toString('utf8')
    const parsed = JSON.parse(json) as { sub?: unknown }
    return typeof parsed.sub === 'string' && parsed.sub ? parsed.sub : null
  } catch {
    return null
  }
}

function limitKey(req: VercelRequest): string {
  const sub = bearerSubject(req)
  if (sub) return `user:${sub}`
  return `ip:${clientIp(req)}`
}

function shouldEnforce(): boolean {
  if (process.env.RATE_LIMIT_DISABLED === '1') return false
  if (process.env.RATE_LIMIT_ENFORCE === '1') return true
  return process.env.VERCEL_ENV === 'production'
}

function prune(now: number): void {
  if (buckets.size <= MAX_KEYS) return
  for (const [key, stamps] of buckets) {
    const fresh = stamps.filter((ts) => now - ts < WINDOW_MS)
    if (fresh.length === 0) buckets.delete(key)
    else buckets.set(key, fresh)
    if (buckets.size <= MAX_KEYS / 2) break
  }
}

/**
 * Sliding window: 20 write requests per 10s per user (JWT `sub`) or IP.
 * In-memory per serverless isolate — enough to blunt bursts; not a global quota.
 * Off in local Vite/e2e unless RATE_LIMIT_ENFORCE=1.
 */
export function checkWriteRateLimit(
  req: VercelRequest,
): { ok: true } | { ok: false; retryAfterSec: number } {
  if (!shouldEnforce()) return { ok: true }
  const method = (req.method || 'GET').toUpperCase()
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
    return { ok: true }
  }

  const now = Date.now()
  prune(now)
  const key = limitKey(req)
  const fresh = (buckets.get(key) ?? []).filter((ts) => now - ts < WINDOW_MS)
  if (fresh.length >= MAX_WRITES) {
    const retryAfterSec = Math.max(
      1,
      Math.ceil((WINDOW_MS - (now - (fresh[0] ?? now))) / 1000),
    )
    return { ok: false, retryAfterSec }
  }
  fresh.push(now)
  buckets.set(key, fresh)
  return { ok: true }
}

export function rejectTooManyRequests(
  res: VercelResponse,
  retryAfterSec: number,
): void {
  corsPreflight(res)
  res.setHeader('Retry-After', String(retryAfterSec))
  res.status(429).json({
    ok: false,
    error: 'Too many requests. Wait a few seconds and try again.',
    code: 'rate_limited',
  })
}
