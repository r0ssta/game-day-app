import { CLUB_CREST_SRC } from '@/lib/branding'

const DEFAULT_THEME = '#12141c'

export type ParentHubPwaBranding = {
  slug: string
  teamName: string
  brandColor?: string | null
  logoUrl?: string | null
}

function upsertLink(rel: string, href: string, attrs: Record<string, string> = {}) {
  const marked = `link[data-parent-hub-pwa="${rel}"]`
  let el =
    document.head.querySelector<HTMLLinkElement>(marked) ||
    document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`)

  if (!el) {
    el = document.createElement('link')
    document.head.appendChild(el)
  }
  el.setAttribute('data-parent-hub-pwa', rel)
  el.rel = rel
  el.href = href
  for (const [key, value] of Object.entries(attrs)) {
    el.setAttribute(key, value)
  }
}

function upsertMeta(name: string, content: string) {
  const marked = `meta[data-parent-hub-pwa="${name}"]`
  let el =
    document.head.querySelector<HTMLMetaElement>(marked) ||
    document.head.querySelector<HTMLMetaElement>(`meta[name="${name}"]`)

  if (!el) {
    el = document.createElement('meta')
    document.head.appendChild(el)
  }
  el.setAttribute('data-parent-hub-pwa', name)
  el.name = name
  el.content = content
}

function resolveLogoUrl(logoUrl: string | null | undefined): string {
  const raw = (logoUrl ?? '').trim() || CLUB_CREST_SRC
  if (/^https?:\/\//i.test(raw)) return raw
  return raw.startsWith('/') ? raw : `/${raw}`
}

/**
 * Vite SPA stand-in for a server `/hub/[slug]/layout.tsx`:
 * injects team-scoped manifest + Apple Home Screen meta tags.
 */
export function applyParentHubPwaHead(branding: ParentHubPwaBranding): () => void {
  const theme = (branding.brandColor?.trim() || DEFAULT_THEME).toLowerCase()
  const logo = resolveLogoUrl(branding.logoUrl)
  const title = branding.teamName.trim() || 'Team Hub'
  const previousTitle = document.title

  const previous = {
    manifest: document.head.querySelector<HTMLLinkElement>('link[rel="manifest"]')?.href ?? null,
    appleIcon:
      document.head.querySelector<HTMLLinkElement>('link[rel="apple-touch-icon"]')?.href ?? null,
    appleTitle:
      document.head.querySelector<HTMLMetaElement>('meta[name="apple-mobile-web-app-title"]')
        ?.content ?? null,
    themeColor:
      document.head.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.content ?? null,
  }

  upsertLink('manifest', `/api/manifest?slug=${encodeURIComponent(branding.slug)}`)
  upsertLink('apple-touch-icon', logo)
  upsertMeta('apple-mobile-web-app-title', title)
  upsertMeta('apple-mobile-web-app-capable', 'yes')
  upsertMeta('theme-color', theme)
  document.title = `${title} · Team Hub`

  return () => {
    if (previous.manifest) upsertLink('manifest', previous.manifest)
    if (previous.appleIcon) upsertLink('apple-touch-icon', previous.appleIcon)
    if (previous.appleTitle) upsertMeta('apple-mobile-web-app-title', previous.appleTitle)
    if (previous.themeColor) upsertMeta('theme-color', previous.themeColor)
    document.title = previousTitle
  }
}

/** Point at the dynamic manifest as soon as `/hub/:slug` is known (before hub fetch). */
export function applyParentHubManifestLink(slug: string): void {
  const clean = slug.trim().toLowerCase()
  if (!clean) return
  upsertLink('manifest', `/api/manifest?slug=${encodeURIComponent(clean)}`)
}
