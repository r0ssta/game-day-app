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
