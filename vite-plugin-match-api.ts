import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin, ViteDevServer } from 'vite'
import { loadEnv } from 'vite'
import type { VercelRequest, VercelResponse } from '@vercel/node'

type Handler = (req: VercelRequest, res: VercelResponse) => Promise<unknown>

const ROUTES: Record<string, string> = {
  '/api/match/log-team-event': '/api/match/log-team-event.ts',
  '/api/match/log-goal': '/api/match/log-goal.ts',
  '/api/match/log-card': '/api/match/log-card.ts',
  '/api/match/log-substitution': '/api/match/log-substitution.ts',
  '/api/match/log-period': '/api/match/log-period.ts',
  '/api/match/log-pk-attempt': '/api/match/log-pk-attempt.ts',
  '/api/match/end-regulation': '/api/match/end-regulation.ts',
  '/api/match/finalize-review': '/api/match/finalize-review.ts',
  '/api/send-web-push': '/api/send-web-push.ts',
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

/**
 * Local stand-in for Vercel match orchestration + push routes so
 * `vite` / `vite preview` can exercise them without `vercel dev`.
 */
export function matchApiPlugin(mode = 'development'): Plugin {
  injectServerEnv(mode)
  let loadModule: ((id: string) => Promise<{ default: Handler }>) | null = null

  const handle = async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const url = req.url ? new URL(req.url, 'http://localhost') : null
    const pathname = url?.pathname ?? ''
    const moduleId = ROUTES[pathname]
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
      const vercelReq = Object.assign(req, {
        query: Object.fromEntries(url?.searchParams.entries() ?? []),
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
