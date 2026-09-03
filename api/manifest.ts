import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'
import { reportApiError } from './_lib/sentry.js'
import { assertNoClientLeakedSecrets, requirePublishableSupabaseEnv } from './_lib/server-env.js'

const DEFAULT_THEME = '#12141c'
const DEFAULT_LOGO_PATH = '/branding/virginia-velocity-crest.png'
const DEFAULT_NAME = 'Virginia Velocity · Team Hub'
const DEFAULT_SHORT = 'VVFC Hub'

type BrandingRow = {
  slug?: string
  name?: string
  brandColor?: string | null
  logoUrl?: string | null
}

function requestOrigin(req: VercelRequest): string {
  const proto = (req.headers['x-forwarded-proto'] as string | undefined)?.split(',')[0]?.trim()
  const host = (req.headers['x-forwarded-host'] as string | undefined)?.split(',')[0]?.trim()
    || req.headers.host
  if (proto && host) return `${proto}://${host}`
  if (host) return `https://${host}`
  return 'https://localhost'
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

function buildManifest(input: {
  origin: string
  name: string
  slug?: string | null
  brandColor?: string | null
  logoUrl?: string | null
}) {
  const theme = (input.brandColor?.trim() || DEFAULT_THEME).toLowerCase()
  const iconSrc = absoluteUrl(input.origin, input.logoUrl)
  const slug = input.slug?.trim().toLowerCase() || ''

  // Team hub installs open `/hub/:slug` in standalone and stay scoped under `/hub/`.
  // The slug-less fallback is the coach app root (index.html default link).
  if (slug) {
    const startPath = `/hub/${encodeURIComponent(slug)}`
    return {
      id: startPath,
      name: input.name,
      short_name: shortName(input.name),
      description: `Live scores, schedule, and match recaps for ${input.name}.`,
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

  // Slug-less requests are for the coach app — never advertise an installable
  // "Team Hub" that starts at Staff Login (/coach) or the marketing root (/).
  return {
    id: '/coach',
    name: 'Virginia Velocity · Game Day',
    short_name: 'Game Day',
    description: 'Coach match control for Virginia Velocity.',
    start_url: `${input.origin}/coach`,
    scope: `${input.origin}/`,
    display: 'browser' as const,
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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  assertNoClientLeakedSecrets()

  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
    return res.status(200).end()
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const origin = requestOrigin(req)
  const slugParam = typeof req.query.slug === 'string' ? req.query.slug.trim().toLowerCase() : ''

  try {
    if (!slugParam) {
      res.setHeader('Content-Type', 'application/manifest+json; charset=utf-8')
      res.setHeader('Cache-Control', 'public, max-age=300')
      return res.status(200).send(
        JSON.stringify(
          buildManifest({
            origin,
            name: DEFAULT_NAME,
            brandColor: DEFAULT_THEME,
            logoUrl: DEFAULT_LOGO_PATH,
          }),
        ),
      )
    }

    const { url: supabaseUrl, key: supabaseKey } = requirePublishableSupabaseEnv()

    const supabase = createClient(supabaseUrl, supabaseKey)
    const { data, error } = await supabase.rpc('get_team_pwa_branding', {
      p_slug: slugParam,
    })

    if (error) {
      await reportApiError('[manifest]', error)
      return res.status(500).json({ error: 'Failed to load team branding' })
    }

    const branding = data as BrandingRow | null
    if (!branding?.slug || !branding.name) {
      return res.status(404).json({ error: 'Team not found' })
    }

    const manifest = buildManifest({
      origin,
      name: branding.name,
      slug: branding.slug,
      brandColor: branding.brandColor,
      logoUrl: branding.logoUrl,
    })

    res.setHeader('Content-Type', 'application/manifest+json; charset=utf-8')
    res.setHeader('Cache-Control', 'public, max-age=300')
    return res.status(200).send(JSON.stringify(manifest))
  } catch (err) {
    await reportApiError('[manifest]', err)
    return res.status(500).json({ error: 'Unexpected error' })
  }
}
