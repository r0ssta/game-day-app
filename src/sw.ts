/// <reference lib="webworker" />

/**
 * Parent Hub service worker — Workbox offline caching + Web Push.
 * Built via vite-plugin-pwa `injectManifest` (precaches hashed app shell).
 */

import { clientsClaim } from 'workbox-core'
import { ExpirationPlugin } from 'workbox-expiration'
import {
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
  precacheAndRoute,
} from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'
import { NetworkFirst, NetworkOnly, StaleWhileRevalidate } from 'workbox-strategies'

declare let self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<string | { url: string; revision: string | null }>
}

/** Vite-plugin-pwa injects the build-time asset list here. */
precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()
clientsClaim()

// Do not skipWaiting() on install — a new CI build stays waiting until the
// in-app toast calls updateServiceWorker(true) → SKIP_WAITING.
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    void self.skipWaiting()
  }
})

// SPA navigations under /hub/* → cached index.html shell
// (SW is registered with scope /hub/ so coach login at / is never controlled.)
// Dev injectManifest has an empty precache, so createHandlerBoundToURL throws.
if (import.meta.env.PROD) {
  registerRoute(
    new NavigationRoute(createHandlerBoundToURL('/index.html'), {
      denylist: [/^\/api\//],
    }),
  )
}

const LIVE_EVENTS_RPC = '/rest/v1/rpc/get_parent_live_events'

const PARENT_HUB_CACHEABLE_RPC_PATHS = new Set([
  '/rest/v1/rpc/get_parent_hub',
  '/rest/v1/rpc/get_parent_hub_by_slug',
  '/rest/v1/rpc/get_team_pwa_branding',
])

function isSupabaseHost(url: URL): boolean {
  return url.hostname.endsWith('.supabase.co') || url.hostname.includes('supabase')
}

function isLiveEventsRpc(url: URL): boolean {
  return url.pathname === LIVE_EVENTS_RPC
}

function isParentHubCacheableRpc(url: URL): boolean {
  return PARENT_HUB_CACHEABLE_RPC_PATHS.has(url.pathname)
}

// Live timeline must never be served stale (goals/shots arrive continuously).
registerRoute(
  ({ url }) => isSupabaseHost(url) && isLiveEventsRpc(url),
  new NetworkOnly(),
  'POST',
)

// Hub shell payload: prefer network so scores stay current; short offline fallback.
const parentHubApiStrategy = new NetworkFirst({
  cacheName: 'parent-hub-api',
  networkTimeoutSeconds: 4,
  plugins: [
    new ExpirationPlugin({
      maxEntries: 40,
      maxAgeSeconds: 60, // 1 minute
      purgeOnQuotaError: true,
    }),
  ],
})

registerRoute(
  ({ url }) => isSupabaseHost(url) && isParentHubCacheableRpc(url),
  parentHubApiStrategy,
  'POST',
)

registerRoute(
  ({ url }) =>
    url.pathname.startsWith('/api/manifest') ||
    url.pathname === '/api/hub' ||
    url.pathname.startsWith('/api/hub/') ||
    (isSupabaseHost(url) && isParentHubCacheableRpc(url)),
  parentHubApiStrategy,
  'GET',
)

// Team crest / logo assets used on Home Screen + hub UI
registerRoute(
  ({ url }) => url.pathname.startsWith('/branding/') || url.pathname.includes('logo'),
  new StaleWhileRevalidate({
    cacheName: 'parent-hub-images',
    plugins: [
      new ExpirationPlugin({
        maxEntries: 50,
        maxAgeSeconds: 60 * 60 * 24 * 7,
        purgeOnQuotaError: true,
      }),
    ],
  }),
  'GET',
)

const coachWriteMatcher = ({ url }: { url: URL }) => {
  if (url.pathname.startsWith('/api/send-web-push')) return true
  if (url.pathname.startsWith('/auth/v1/')) return true
  if (isSupabaseHost(url) && (isLiveEventsRpc(url) || isParentHubCacheableRpc(url))) {
    return false
  }
  if (isSupabaseHost(url) && url.pathname.startsWith('/rest/v1/')) return true
  if (isSupabaseHost(url) && url.pathname.startsWith('/functions/v1/')) return true
  return true
}

const networkOnly = new NetworkOnly()

// Coach mutations + authenticated write paths must never be served from cache.
for (const method of ['POST', 'PUT', 'PATCH', 'DELETE'] as const) {
  registerRoute(coachWriteMatcher, networkOnly, method)
}

// ---------------------------------------------------------------------------
// Web Push (unchanged behavior)
// ---------------------------------------------------------------------------

self.addEventListener('push', (event) => {
  let payload = {
    title: 'Virginia Velocity',
    body: 'Match update',
    icon: '/branding/virginia-velocity-crest.png',
    badge: '/branding/virginia-velocity-crest.png',
    url: '/',
    tag: 'vvfc-match',
  }

  try {
    if (event.data) {
      const data = event.data.json() as Record<string, unknown>
      payload = {
        title: typeof data.title === 'string' ? data.title : payload.title,
        body: typeof data.body === 'string' ? data.body : payload.body,
        icon: typeof data.icon === 'string' ? data.icon : payload.icon,
        badge: typeof data.badge === 'string' ? data.badge : payload.badge,
        url: typeof data.url === 'string' ? data.url : payload.url,
        tag: typeof data.tag === 'string' ? data.tag : payload.tag,
      }
    }
  } catch {
    try {
      const text = event.data?.text()
      if (text) payload.body = text
    } catch {
      // keep defaults
    }
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: payload.icon,
      badge: payload.badge,
      tag: payload.tag,
      renotify: true,
      data: { url: payload.url },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const targetUrl =
    (event.notification.data as { url?: string } | undefined)?.url || '/'

  event.waitUntil(
    (async () => {
      const allClients = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      })
      for (const client of allClients) {
        if ('focus' in client) {
          await client.focus()
          if ('navigate' in client && targetUrl) {
            try {
              await client.navigate(targetUrl)
            } catch {
              // ignore navigate failures on older browsers
            }
          }
          return
        }
      }
      await self.clients.openWindow(targetUrl)
    })(),
  )
})
