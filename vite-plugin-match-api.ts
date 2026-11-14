import type { IncomingMessage, ServerResponse } from 'node:http'
import { createClient } from '@supabase/supabase-js'
import type { Plugin, ViteDevServer } from 'vite'
import { loadEnv } from 'vite'
import type { VercelRequest, VercelResponse } from '@vercel/node'

type Handler = (req: VercelRequest, res: VercelResponse) => Promise<unknown>

const MATCH_API_MODULE = '/api/match.ts'
const SEND_WEB_PUSH_MODULE = '/api/send-web-push.ts'
const HUB_API_MODULE = '/api/hub.ts'

function routeModule(pathname: string): string | null {
  if (pathname === '/api/send-web-push') return SEND_WEB_PUSH_MODULE
  if (pathname === '/api/hub' || pathname.startsWith('/api/hub/')) return HUB_API_MODULE
  if (pathname === '/api/match' || pathname.startsWith('/api/match/')) {
    return MATCH_API_MODULE
  }
  return null
}

function hubSlugFromPath(pathname: string): string | undefined {
  if (!pathname.startsWith('/api/hub/')) return undefined
  const slug = pathname.slice('/api/hub/'.length).split('/')[0]
  return slug || undefined
}

function matchActionFromPath(pathname: string): string | undefined {
  if (!pathname.startsWith('/api/match/')) return undefined
  const action = pathname.slice('/api/match/'.length).split('/')[0]
  return action || undefined
}

function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8').trim()
      if (!raw) {
        resolve(null)
        return
      }
      try {
        resolve(JSON.parse(raw))
      } catch {
        resolve(raw)
      }
    })
    req.on('error', reject)
  })
}

function asVercelResponse(res: ServerResponse): VercelResponse {
  const wrapper = res as ServerResponse & VercelResponse
  wrapper.status = ((code: number) => {
    res.statusCode = code
    return wrapper
  }) as VercelResponse['status']
  wrapper.json = ((body: unknown) => {
    if (!res.getHeader('Content-Type')) {
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
    }
    res.end(JSON.stringify(body))
    return wrapper
  }) as VercelResponse['json']
  return wrapper
}

function injectServerEnv(mode: string) {
  const env = loadEnv(mode, process.cwd(), '')
  for (const [key, value] of Object.entries(env)) {
    if (process.env[key] === undefined) {
      process.env[key] = value
    }
  }
}

function isLoopbackAddress(addr: string | undefined): boolean {
  return addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1'
}

function supabaseAuthStorageKey(supabaseUrl: string): string {
  const ref = new URL(supabaseUrl).hostname.split('.')[0]
  return `sb-${ref}-auth-token`
}

/**
 * Local-only staff session for browser/agent verification.
 * Never shipped as a Vercel route — Vite middleware, localhost POST, e2e creds.
 */
async function handleDevStaffSession(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  mode: string,
): Promise<boolean> {
  if (pathname !== '/api/dev/staff-session') return false
  if (mode === 'production') return false

  const json = (status: number, body: unknown) => {
    res.statusCode = status
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.setHeader('Cache-Control', 'no-store')
    res.end(JSON.stringify(body))
  }

  if (req.method !== 'POST') {
    json(405, { error: 'POST only' })
    return true
  }
  if (!isLoopbackAddress(req.socket.remoteAddress)) {
    json(403, { error: 'localhost only' })
    return true
  }

  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
  const key =
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.SUPABASE_PUBLISHABLE_KEY
  const email = process.env.E2E_STAFF_EMAIL?.trim()
  const password = process.env.E2E_STAFF_PASSWORD
  if (!url || !key || !email || !password) {
    json(503, { error: 'E2E staff credentials not configured' })
    return true
  }

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error || !data.session) {
    json(401, { error: error?.message || 'Staff password sign-in failed' })
    return true
  }

  json(200, {
    storageKey: supabaseAuthStorageKey(url),
    session: data.session,
  })
  return true
}

/**
 * Local stand-in for Vercel match, hub, and push routes so
 * `vite` / `vite preview` can exercise them without `vercel dev`.
 */
export function matchApiPlugin(mode = 'development'): Plugin {
  injectServerEnv(mode)
  let loadModule: ((id: string) => Promise<{ default: Handler }>) | null = null

  const handle = async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const url = req.url ? new URL(req.url, 'http://localhost') : null
    const pathname = url?.pathname ?? ''
    if (await handleDevStaffSession(req, res, pathname, mode)) return
    const moduleId = routeModule(pathname)
    if (!moduleId || !loadModule) {
      next()
      return
    }

    try {
      const mod = await loadModule(moduleId)
      const handler = mod.default
      const body =
        req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH'
          ? await readBody(req)
          : undefined
      const query = Object.fromEntries(url?.searchParams.entries() ?? [])
      const action = matchActionFromPath(pathname)
      if (action && !query.action) query.action = action
      const hubSlug = hubSlugFromPath(pathname)
      if (hubSlug && !query.slug) query.slug = hubSlug
      const vercelReq = Object.assign(req, {
        query,
        body,
      }) as VercelRequest
      await handler(vercelReq, asVercelResponse(res))
    } catch (err) {
      console.error('[vite match-api]', pathname, err)
      if (!res.headersSent) {
        res.statusCode = 500
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.end(
          JSON.stringify({
            ok: false,
            error: err instanceof Error ? err.message : 'Unexpected error',
          }),
        )
      }
    }
  }

  const attach = (server: ViteDevServer) => {
    loadModule = (id) =>
      server.ssrLoadModule(id) as Promise<{ default: Handler }>
    server.middlewares.use((req, res, next) => {
      void handle(req, res, next)
    })
  }

  return {
    name: 'match-api',
    configureServer: attach,
  }
}
