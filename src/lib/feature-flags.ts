/**
 * Temporary production feature flags.
 * Flip to `true` to restore archived Game Day helpers without digging through git history.
 *
 * Components also self-gate on these flags so a stale parent render cannot show them.
 */
export const ENABLE_SUB_ASSISTANT = false
export const ENABLE_WAKE_LOCK = true
/** QA match-clock speed controls (1× / 50× / 100×) — keep off for live game day. */
export const ENABLE_QA_SPEED = false
/** Sideline share link + live micro-stats panel — hidden until ready for coaches. */
export const ENABLE_STAT_TRACKER = false
/**
 * Per-position impact ratings on post-game recap.
 * Keep off for now; overall player rating stays available.
 */
export const ENABLE_POSITIONAL_RECAP_RATINGS = false
/**
 * Parent / Fan Team Hub PWA (read-only live feed, recaps, web push).
 * Requires `.env.local` VAPID keys + `/api/send-web-push` (see `api/send-web-push.ts`).
 */
export const ENABLE_PARENT_HUB = true
