import type { VercelRequest, VercelResponse } from '@vercel/node'
import { invalidateByTag } from '@vercel/functions'

export const PARENT_HUB_CACHE_TTL_SEC = 60
export const PARENT_HUB_SWR_SEC = 30

export function parentHubCacheTag(slug: string): string {
  return `parent-hub-${slug.trim().toLowerCase()}`
}

export function applyParentHubCacheHeaders(res: VercelResponse, slug: string): void {
  const tag = parentHubCacheTag(slug)
  const cacheControl = `public, s-maxage=${PARENT_HUB_CACHE_TTL_SEC}, stale-while-revalidate=${PARENT_HUB_SWR_SEC}`
  // Shared caches (Vercel edge) hold the payload for 60s and may serve stale for 30s.
  res.setHeader('Cache-Control', cacheControl)
  res.setHeader('Vercel-CDN-Cache-Control', cacheControl)
  res.setHeader('Vercel-Cache-Tag', tag)
}

function teamSlugFromBody(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null
  const slug = (body as { teamSlug?: unknown }).teamSlug
  if (typeof slug !== 'string') return null
  const trimmed = slug.trim().toLowerCase()
  return trimmed.length > 0 ? trimmed : null
}

/**
 * Mark the Parent Hub CDN entry stale after a live match write.
 * Equivalent to Next.js `revalidatePath('/hub/[slug]')` / `revalidateTag`.
 */
export function revalidateParentHubFromRequest(req: VercelRequest): void {
  const slug = teamSlugFromBody(req.body)
  if (!slug) return
  void invalidateByTag(parentHubCacheTag(slug)).catch((err) => {
    console.warn('[parent-hub-cache] invalidate failed', err)
  })
}
