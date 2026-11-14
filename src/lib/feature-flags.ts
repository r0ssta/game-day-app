/**
 * Production feature flags.
 * Components self-gate on these so a stale parent render cannot show them.
 */
/** Rotation interval on Game Day setup. Uses who is marked attending. */
export const ENABLE_SUB_ASSISTANT = true
export const ENABLE_WAKE_LOCK = true
/** QA match-clock speed controls (1× / 50× / 100×) — keep off for live game day. */
export const ENABLE_QA_SPEED = false
/** Sideline share link + live micro-stats panel. */
export const ENABLE_STAT_TRACKER = true
/** Per-position ratings on the post-game recap, alongside the overall 1–5. */
export const ENABLE_POSITIONAL_RECAP_RATINGS = true
/**
 * Parent / Fan Team Hub PWA (read-only live feed, recaps, web push).
 * Requires `.env.local` VAPID keys + `/api/send-web-push` (see `api/send-web-push.ts`).
 */
export const ENABLE_PARENT_HUB = true
