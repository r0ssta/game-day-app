import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin, PreviewServer, ViteDevServer } from 'vite'
import { createClient } from '@supabase/supabase-js'
import { loadEnv } from 'vite'

const DEFAULT_THEME = '#12141c'
const DEFAULT_LOGO_PATH = '/branding/virginia-velocity-crest.png'

type BrandingRow = {
  slug?: string
  name?: string
  brandColor?: string | null
  logoUrl?: string | null
}

function absoluteUrl(origin: string, value: string | null | undefined): string {
  const raw = (value ?? '').trim() || DEFAULT_LOGO_PATH
  if (/^https?:\/\//i.test(raw)) return raw
  const path = raw.startsWith('/') ? raw : `/${raw}`
  return `${origin}${path}`
}

function shortName(name: string): string {
  const trimmed = name.trim()
  if (trimmed.length <= 12) return trimmed
  return `${trimmed.slice(0, 11).trimEnd()}…`
}

function buildTeamManifest(input: {
  origin: string
  name: string
  slug: string
  brandColor?: string | null
  logoUrl?: string | null
}) {
  const theme = (input.brandColor?.trim() || DEFAULT_THEME).toLowerCase()
  const iconSrc = absoluteUrl(input.origin, input.logoUrl)
  const startPath = `/hub/${encodeURIComponent(input.slug)}`

  return {
    id: startPath,
    name: input.name,
    short_name: shortName(input.name),
    description: `Live scores and match recaps for ${input.name}.`,
    start_url: `${input.origin}${startPath}`,
    scope: `${input.origin}/hub/`,
    display: 'standalone' as const,
    orientation: 'portrait-primary',
    launch_handler: { client_mode: 'navigate-existing' },
    background_color: theme,
    theme_color: theme,
    lang: 'en-US',
    icons: [
      {
        src: iconSrc,
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: iconSrc,
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any maskable',
      },
    ],
  }
}

function requestOrigin(req: IncomingMessage): string {
  const host = req.headers.host || '127.0.0.1:4173'
  return `http://${host}`
}

function sendJson(
  res: ServerResponse,
  status: number,
  body: unknown,
  contentType = 'application/json; charset=utf-8',
) {
  res.statusCode = status
  res.setHeader('Content-Type', contentType)
  res.setHeader('Cache-Control', 'public, max-age=60')
  res.end(typeof body === 'string' ? body : JSON.stringify(body))
}

/**
 * Local stand-in for Vercel `/api/manifest` so Playwright + `vite preview`
 * can exercise the dynamic PWA manifest without `vercel dev`.
 */
export function parentHubManifestApiPlugin(mode = 'development'): Plugin {
  const env = loadEnv(mode, process.cwd(), '')

  const handle = async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const url = req.url ? new URL(req.url, 'http://localhost') : null
    if (!url || url.pathname !== '/api/manifest') {
      next()
      return
    }

    if (req.method === 'OPTIONS') {
      res.statusCode = 200
      res.setHeader('Access-Control-Allow-Origin', '*')
      res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
      res.end()
      return
    }

    if (req.method !== 'GET') {
      sendJson(res, 405, { error: 'Method not allowed' })
      return
    }

    const slug = (url.searchParams.get('slug') || '').trim().toLowerCase()
    if (!slug) {
      sendJson(res, 400, { error: 'slug is required' })
      return
    }

    const supabaseUrl = env.VITE_SUPABASE_URL || env.SUPABASE_URL
    const supabaseKey =
      env.VITE_SUPABASE_PUBLISHABLE_KEY ||
      env.SUPABASE_ANON_KEY ||
      env.SUPABASE_PUBLISHABLE_KEY

    if (!supabaseUrl || !supabaseKey) {
      sendJson(res, 500, { error: 'Supabase env not configured' })
      return
    }

    try {
      const supabase = createClient(supabaseUrl, supabaseKey)
      const { data, error } = await supabase.rpc('get_team_pwa_branding', {
        p_slug: slug,
      })

      if (error) {
        console.error('[vite manifest]', error.message)
        sendJson(res, 500, { error: 'Failed to load team branding' })
        return
      }

      const branding = data as BrandingRow | null
      if (!branding?.slug || !branding.name) {
        sendJson(res, 404, { error: 'Team not found' })
        return
      }

      const manifest = buildTeamManifest({
        origin: requestOrigin(req),
        name: branding.name,
        slug: branding.slug,
        brandColor: branding.brandColor,
        logoUrl: branding.logoUrl,
      })

      sendJson(res, 200, JSON.stringify(manifest), 'application/manifest+json; charset=utf-8')
    } catch (err) {
      console.error('[vite manifest]', err)
      sendJson(res, 500, { error: 'Unexpected error' })
    }
  }

  const attach = (server: ViteDevServer | PreviewServer) => {
    server.middlewares.use((req, res, next) => {
      void handle(req, res, next)
    })
  }

  return {
    name: 'parent-hub-manifest-api',
    configureServer: attach,
    configurePreviewServer: attach,
  }
}
