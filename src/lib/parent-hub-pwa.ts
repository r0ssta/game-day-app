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

/** True when launched as an installed Home Screen / standalone PWA (incl. iOS Safari). */
export function isStandalonePwa(): boolean {
  if (typeof window === 'undefined') return false
  const nav = window.navigator as Navigator & { standalone?: boolean }
  return (
    Boolean(nav.standalone) ||
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: fullscreen)').matches
  )
}

/** iPhone / iPod / iPad (incl. iPadOS desktop UA). */
export function isIosDevice(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  if (/iPad|iPhone|iPod/.test(ua)) return true
  // iPadOS 13+ reports as MacIntel with touch points
  return navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1
}

/**
 * Apple only allows Web Push from a Home Screen / standalone launch.
 * Android + desktop browsers support push in a normal tab.
 */
export function requiresStandaloneForWebPush(): boolean {
  return isIosDevice()
}

/** Whether Parent Hub should offer the Enable Alerts control in the current context. */
export function canOfferParentWebPush(): boolean {
  if (typeof window === 'undefined') return false
  if (!('Notification' in window) || !('PushManager' in window) || !('serviceWorker' in navigator)) {
    return false
  }
  if (requiresStandaloneForWebPush()) return isStandalonePwa()
  return true
}

const PARENT_HUB_SLUG_STORAGE_KEY = 'vvfc-parent-hub-slug'

/** Remember the last team hub slug so standalone launches that land on `/` can restore it. */
export function rememberParentHubSlug(slug: string): void {
  const clean = slug.trim().toLowerCase()
  if (!clean || typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(PARENT_HUB_SLUG_STORAGE_KEY, clean)
  } catch {
    // private mode / blocked storage
  }
}

export function readRememberedParentHubSlug(): string | null {
  if (typeof localStorage === 'undefined') return null
  try {
    const value = localStorage.getItem(PARENT_HUB_SLUG_STORAGE_KEY)?.trim().toLowerCase()
    return value || null
  } catch {
    return null
  }
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
