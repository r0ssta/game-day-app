import {
  isPeriodEndSubEvent,
  isStartingLineupEvent,
  parsePositionSwitchNote,
  parseStartingLineupPosition,
  parseTacticalPositionNote,
} from '@/lib/match-event-notes'
import { supabase } from '@/supabaseClient'
import { ENABLE_PARENT_HUB } from '@/lib/feature-flags'
import {
  isIosDevice,
  isStandalonePwa,
  readRememberedParentHubSlug,
} from '@/lib/parent-hub-pwa'
import { formatPlayerFullName } from '@/lib/player-names'
import { ParentHubPayloadSchema } from '@/schemas'
import { parseDbRow } from '@/lib/zod-parse'
import {
  buildCardPush,
  buildFullTimePush,
  buildGoalPush,
  buildMatchStartPush,
  buildPeriodPush,
  buildSubstitutionPush,
} from '@/lib/match-push-copy'

export {
  buildCardPush,
  buildFullTimePush,
  buildGoalPush,
  buildMatchStartPush,
  buildPeriodPush,
  buildSubstitutionPush,
}

/** Public VAPID key — must be set as VITE_VAPID_PUBLIC_KEY (see `.env.local`). */
export const VAPID_PUBLIC_KEY =
  (import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined)?.trim() || ''

export type ParentHubPlayer = {
  id: string
  firstName: string
  lastName: string
  number: number | null
}

export type ParentHubMatch = {
  id: string
  opponent: string
  status: 'scheduled' | 'live' | 'pending_review' | 'final'
  match_date: string | null
  match_time: string | null
  date: string
  location_type: string | null
  home_score: number
  away_score: number
  home_pk_score: number
  away_pk_score: number
  pk_winner_is_us: boolean | null
  period: string
  current_period: number | null
  total_periods: number | null
  period_length: number | null
  half_length: number
  period_clock_started: boolean
  clock_seconds: number
  parent_facing_recap: string | null
  starters?: ParentHubPlayer[]
  /** Present when staff preview included this testing match. */
  isTest?: boolean
}

export type ParentHubPayload = {
  teamId: string
  teamSlug: string
  teamName: string
  ageGroup: string | null
  brandColor: string | null
  logoUrl: string | null
  players: ParentHubPlayer[]
  matches: ParentHubMatch[]
  /** True when the viewer is staff and test matches were included. */
  staffPreview?: boolean
}

export type ParentHubRoute =
  | { kind: 'slug'; slug: string }
  | { kind: 'teamId'; teamId: string }

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export type ParentLiveEvent = {
  id: string
  matchId: string
  playerId: string | null
  playerName: string | null
  jersey: number | null
  eventType: string
  timestamp: number
  eventNotes: string | null
  isPk: boolean | null
  assistPlayerId: string | null
  assistPlayerName: string | null
  createdAt: string
}

function routeFromSegment(segment: string): ParentHubRoute {
  const value = decodeURIComponent(segment).trim()
  if (UUID_RE.test(value)) return { kind: 'teamId', teamId: value }
  return { kind: 'slug', slug: value.toLowerCase() }
}

export function parseParentHubRoute(): ParentHubRoute | null {
  const params = new URLSearchParams(window.location.search)
  if (params.get('teamHub') === '1') {
    const teamId = params.get('teamId')?.trim()
    if (teamId) return { kind: 'teamId', teamId }
    const slug = params.get('slug')?.trim()
    if (slug) return { kind: 'slug', slug: slug.toLowerCase() }
  }

  // Preferred public route: /hub/:slug
  const hubSlug = window.location.pathname.match(/^\/hub\/([^/]+)\/?$/i)
  if (hubSlug?.[1]) return routeFromSegment(hubSlug[1])

  // Bare /hub with ?slug= or ?teamId= (common when start_url/scope was wrong)
  if (/^\/hub\/?$/i.test(window.location.pathname)) {
    const teamId = params.get('teamId')?.trim()
    if (teamId) return { kind: 'teamId', teamId }
    const slug = params.get('slug')?.trim()
    if (slug) return { kind: 'slug', slug: slug.toLowerCase() }
  }

  // Legacy paths that used team UUID
  const pathMatch = window.location.pathname.match(/^\/team\/([^/]+)\/?$/i)
  if (pathMatch?.[1]) return routeFromSegment(pathMatch[1])

  const hubPath = window.location.pathname.match(/^\/team\/([^/]+)\/hub\/?$/i)
  if (hubPath?.[1]) return routeFromSegment(hubPath[1])

  const hash = window.location.hash.startsWith('#')
    ? window.location.hash.slice(1)
    : window.location.hash
  if (hash) {
    const queryIndex = hash.indexOf('?')
    const hashPath = queryIndex >= 0 ? hash.slice(0, queryIndex) : hash
    const hashSearch = queryIndex >= 0 ? hash.slice(queryIndex + 1) : ''
    const fromHub = hashPath.match(/^\/?hub\/([^/]+)\/?$/i)
    if (fromHub?.[1]) return routeFromSegment(fromHub[1])
    const fromPath = hashPath.match(/^\/?team\/([^/]+)(?:\/hub)?\/?$/i)
    if (fromPath?.[1]) return routeFromSegment(fromPath[1])
    const hashParams = new URLSearchParams(hashSearch)
    if (hashParams.get('teamHub') === '1' || /^\/?hub\/?$/i.test(hashPath)) {
      const teamId = hashParams.get('teamId')?.trim()
      if (teamId) return { kind: 'teamId', teamId }
      const slug = hashParams.get('slug')?.trim()
      if (slug) return { kind: 'slug', slug: slug.toLowerCase() }
    }
  }

  return null
}

/** Public Parent Hub URL using the team's unique slug. */
export function buildParentHubUrl(teamSlug: string): string {
  const slug = teamSlug.trim().toLowerCase()
  return `${window.location.origin}/hub/${encodeURIComponent(slug)}`
}

/** Staff-only preview of testing matches. Parents never see this URL’s extra data. */
export function buildParentHubPreviewUrl(teamSlug: string): string {
  return `${buildParentHubUrl(teamSlug)}?preview=1`
}

export function isParentHubStaffPreviewRequest(search = window.location.search): boolean {
  return new URLSearchParams(search).get('preview') === '1'
}

/** Deep link when only the team id is known (push fallback). */
export function buildParentHubUrlByTeamId(teamId: string): string {
  const id = teamId.trim()
  return `${window.location.origin}/?teamHub=1&teamId=${encodeURIComponent(id)}`
}

/**
 * If a Home Screen / standalone launch landed on the coach root (`/`) instead of
 * `/hub/:slug`, rewrite to the remembered Parent Hub before auth mounts.
 * Returns true when the location was corrected.
 */
export function restoreStandaloneParentHubPath(): boolean {
  if (typeof window === 'undefined') return false
  if (!isStandalonePwa()) return false
  if (parseParentHubRoute()) return false

  const path = window.location.pathname
  // Only bounce bare app roots — never hijack tracker or other public routes.
  const isCoachRoot =
    path === '/' ||
    path === '' ||
    path === '/index.html' ||
    path === '/coach' ||
    path.startsWith('/coach/')
  if (!isCoachRoot) return false

  const slug = readRememberedParentHubSlug()
  if (!slug) return false

  const next = `/hub/${encodeURIComponent(slug)}${window.location.search}${window.location.hash}`
  window.history.replaceState(null, '', next)
  return true
}

export async function shareParentHubLink(
  teamSlug: string,
  teamLabel: string,
): Promise<'shared' | 'copied'> {
  const url = buildParentHubUrl(teamSlug)
  const title = `${teamLabel} · Team Hub`
  const text = `Follow ${teamLabel} live scores, schedule, and match recaps:\n${url}`

  if (typeof navigator.share === 'function') {
    try {
      // iOS (and some Android share targets) ignore `url` and substitute the
      // current document URL instead — from the coach app that is Staff Login (/).
      // Only pass `url` when we are already on a Parent Hub route.
      const sharingFromHub = parseParentHubRoute() != null
      if (sharingFromHub) {
        await navigator.share({ title, text, url })
      } else if (isIosDevice()) {
        await navigator.share({ title, text })
      } else {
        // Prefer url+text on Android/desktop, but fall back to text-only if needed.
        try {
          await navigator.share({ title, text, url })
        } catch (err) {
          if (err instanceof DOMException && err.name === 'AbortError') throw err
          await navigator.share({ title, text })
        }
      }
      return 'shared'
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') throw err
    }
  }

  await navigator.clipboard.writeText(url)
  return 'copied'
}

/**
 * When an installed PWA is opened via a captured link, Chromium may launch at
 * start_url (/) and deliver the intended URL through launchQueue instead.
 */
export function installParentHubLaunchConsumer(): void {
  const launchQueue = (
    window as Window & {
      launchQueue?: {
        setConsumer: (cb: (params: { targetURL?: string }) => void) => void
      }
    }
  ).launchQueue
  if (!launchQueue?.setConsumer) return

  launchQueue.setConsumer((params) => {
    const raw = params.targetURL?.trim()
    if (!raw) return
    try {
      const target = new URL(raw, window.location.origin)
      if (target.origin !== window.location.origin) return
      const next = `${target.pathname}${target.search}${target.hash}`
      const current = `${window.location.pathname}${window.location.search}${window.location.hash}`
      if (next === current) return
      // Force a full navigation so Parent Hub bootstrap runs before Auth mounts.
      window.location.replace(next)
    } catch {
      // ignore malformed launch targets
    }
  })
}

function normalizeParentHubPayload(data: unknown): ParentHubPayload {
  const parsed = parseDbRow(ParentHubPayloadSchema, data, 'parentHub')
  if (!parsed?.teamId) throw new Error('Team hub not found')
  return {
    teamId: parsed.teamId,
    teamSlug: parsed.teamSlug || '',
    teamName: parsed.teamName,
    ageGroup: parsed.ageGroup ?? null,
    brandColor: parsed.brandColor ?? null,
    logoUrl: parsed.logoUrl ?? null,
    players: parsed.players ?? [],
    matches: (parsed.matches ?? []).map((match) => ({
      ...match,
      isTest: Boolean(match.isTest),
      starters: Array.isArray(match.starters)
        ? match.starters.map((player) => ({
            id: player.id,
            firstName: player.firstName,
            lastName: player.lastName,
            number: player.number ?? null,
          }))
        : [],
    })),
    staffPreview: Boolean(parsed.staffPreview),
  }
}

export async function fetchParentHub(
  route: ParentHubRoute,
  options?: { includeTest?: boolean },
): Promise<ParentHubPayload> {
  const includeTest = Boolean(options?.includeTest)

  // Never use the cached public /api/hub for staff preview — that response is
  // shared with parents and must stay free of testing matches.
  if (includeTest) {
    if (route.kind === 'slug') {
      const { data, error } = await supabase.rpc('get_parent_hub_by_slug', {
        p_slug: route.slug,
        p_include_test: true,
      })
      if (error) throw error
      return normalizeParentHubPayload(data)
    }
    const { data, error } = await supabase.rpc('get_parent_hub', {
      p_team_id: route.teamId,
      p_include_test: true,
    })
    if (error) throw error
    return normalizeParentHubPayload(data)
  }

  if (route.kind === 'slug') {
    try {
      const response = await fetch(`/api/hub/${encodeURIComponent(route.slug)}`)
      if (response.ok) {
        return normalizeParentHubPayload(await response.json())
      }
    } catch {
      // Fall through to the public RPC when the cached edge route is down.
    }
    const { data, error } = await supabase.rpc('get_parent_hub_by_slug', {
      p_slug: route.slug,
    })
    if (error) throw error
    return normalizeParentHubPayload(data)
  }

  const { data, error } = await supabase.rpc('get_parent_hub', {
    p_team_id: route.teamId,
  })
  if (error) throw error
  return normalizeParentHubPayload(data)
}

export async function fetchParentLiveEvents(
  matchId: string,
  options?: { includeTest?: boolean },
): Promise<ParentLiveEvent[]> {
  const { data, error } = await supabase.rpc(
    'get_parent_live_events',
    options?.includeTest
      ? { p_match_id: matchId, p_include_test: true }
      : { p_match_id: matchId },
  )
  if (error) throw error
  return Array.isArray(data) ? (data as ParentLiveEvent[]) : []
}

export function isParentHubFinishedMatch(status: ParentHubMatch['status']): boolean {
  return status === 'final' || status === 'pending_review'
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const output = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i)
  return output
}

export async function registerParentServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null
  // Parent Hub SW must only control /hub/* — never the coach login at /.
  if (!parseParentHubRoute()) return null
  try {
    // Old root-scoped workers can keep serving a stale shell (missing VAPID) on /hub/*.
    await unregisterRootScopedParentServiceWorker({ force: true })
    const { registerPwaUpdates } = await import('@/lib/pwa-updates')
    const registration = await registerPwaUpdates()
    return (
      registration ??
      (await navigator.serviceWorker.getRegistration('/hub/')) ??
      (await navigator.serviceWorker.ready)
    )
  } catch (err) {
    console.warn('[sw] register failed', err)
    return null
  }
}

/**
 * Remove root-scoped service workers that used to control the whole origin.
 * Those installs cache an old app shell and can keep showing Staff Login / missing
 * VAPID errors on Parent Hub routes.
 */
export async function unregisterRootScopedParentServiceWorker(
  options?: { force?: boolean },
): Promise<void> {
  if (!('serviceWorker' in navigator)) return
  // On coach routes always clean up. On hub routes, only when force-registering.
  if (parseParentHubRoute() && !options?.force) return
  try {
    const registrations = await navigator.serviceWorker.getRegistrations()
    const origin = window.location.origin
    let removedRoot = false
    await Promise.all(
      registrations.map(async (registration) => {
        const scope = registration.scope.replace(/\/$/, '') || origin
        // Unregister only root-scoped workers (…/), keep /hub/ workers alone.
        if (scope === origin) {
          removedRoot = true
          await registration.unregister()
        }
      }),
    )
    if (removedRoot && 'caches' in window) {
      const keys = await caches.keys()
      await Promise.all(
        keys
          .filter((key) => /workbox|precache|parent-hub/i.test(key))
          .map((key) => caches.delete(key)),
      )
      // One-shot reload so the next paint uses network assets + hub-scoped SW.
      const flag = 'vvfc-hub-sw-cache-bust'
      try {
        if (!sessionStorage.getItem(flag)) {
          sessionStorage.setItem(flag, '1')
          window.location.reload()
        }
      } catch {
        // ignore storage failures
      }
    }
  } catch (err) {
    console.warn('[sw] unregister root scope failed', err)
  }
}

function pushEnabledStorageKey(teamId: string) {
  return `vvfc-push-enabled:${teamId}`
}

function pushServerSyncedKey(teamId: string) {
  return `vvfc-push-server-synced:${teamId}`
}

export function getLocalPushEnabled(teamId: string): boolean {
  try {
    return localStorage.getItem(pushEnabledStorageKey(teamId)) === '1'
  } catch {
    return false
  }
}

export function getPushServerSynced(teamId: string): boolean {
  try {
    return localStorage.getItem(pushServerSyncedKey(teamId)) === '1'
  } catch {
    return false
  }
}

export function setLocalPushEnabled(teamId: string, enabled: boolean) {
  try {
    if (enabled) {
      localStorage.setItem(pushEnabledStorageKey(teamId), '1')
      localStorage.setItem(pushServerSyncedKey(teamId), '1')
    } else {
      localStorage.removeItem(pushEnabledStorageKey(teamId))
      localStorage.removeItem(pushServerSyncedKey(teamId))
    }
  } catch {
    // ignore quota / private mode
  }
}

/** Kept for older imports; always false — migration is handled by server-sync flags. */
export function needsPushSyncMigration(): boolean {
  return false
}

/** True when this browser already has an active PushSubscription. */
export async function hasActivePushSubscription(): Promise<boolean> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false
  try {
    const registration = await resolveHubPushRegistration()
    if (!registration) return false
    const existing = await registration.pushManager.getSubscription()
    return Boolean(existing)
  } catch {
    return false
  }
}

async function resolveHubPushRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null
  const existing =
    (await navigator.serviceWorker.getRegistration('/hub/')) ??
    (await navigator.serviceWorker.getRegistration())
  if (existing) {
    await navigator.serviceWorker.ready
    return existing
  }
  return registerParentServiceWorker()
}

/**
 * If the browser already has a PushSubscription, upsert it to Supabase.
 * Does NOT call pushManager.subscribe() — safe to run without a user gesture on iOS.
 * Returns true when a row was saved.
 */
export async function syncExistingParentWebPush(input: {
  teamId: string
  targetPlayerId?: string | null
}): Promise<boolean> {
  if (!VAPID_PUBLIC_KEY) return false
  if (!('Notification' in window) || Notification.permission !== 'granted') return false

  const registration = await resolveHubPushRegistration()
  if (!registration) return false
  const subscription = await registration.pushManager.getSubscription()
  if (!subscription) return false

  const json = subscription.toJSON()
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return false

  const { error } = await supabase.rpc('subscribe_parent_web_push', {
    p_team_id: input.teamId,
    p_endpoint: json.endpoint,
    p_p256dh: json.keys.p256dh,
    p_auth: json.keys.auth,
    p_target_player_id: input.targetPlayerId ?? null,
    p_user_agent: navigator.userAgent,
  })
  if (error) throw error
  return true
}

/**
 * Create/refresh a PushSubscription and persist it. Must run from a user gesture
 * on iOS (button tap) — do not call from useEffect.
 */
export async function subscribeParentWebPush(input: {
  teamId: string
  targetPlayerId: string | null
  forceRefresh?: boolean
}): Promise<void> {
  if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) {
    throw new Error('Push notifications are not supported in this browser.')
  }
  if (!VAPID_PUBLIC_KEY) {
    throw new Error(
      'Push is not configured on this deployment (missing VAPID public key). Try a hard refresh, or reopen the hub from the shared link.',
    )
  }

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') {
    throw new Error('Notification permission was not granted.')
  }

  const registration = await resolveHubPushRegistration()
  if (!registration) {
    throw new Error(
      'Service worker could not be registered. Close the hub fully, reopen it from the Home Screen icon, then try again.',
    )
  }

  await navigator.serviceWorker.ready

  let subscription = await registration.pushManager.getSubscription()
  if (input.forceRefresh && subscription) {
    try {
      await subscription.unsubscribe()
    } catch {
      // continue — subscribe() below will replace when possible
    }
    subscription = null
  }

  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
    })
  }

  const json = subscription.toJSON()
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
    throw new Error('Push subscription was incomplete.')
  }

  const { data, error } = await supabase.rpc('subscribe_parent_web_push', {
    p_team_id: input.teamId,
    p_endpoint: json.endpoint,
    p_p256dh: json.keys.p256dh,
    p_auth: json.keys.auth,
    p_target_player_id: input.targetPlayerId,
    p_user_agent: navigator.userAgent,
  })
  if (error) throw error
  if (!data || (typeof data === 'object' && 'ok' in data && !(data as { ok?: boolean }).ok)) {
    throw new Error('Server did not confirm the push subscription.')
  }
}

export type WebPushEventType =
  | 'match_start'
  | 'period_start'
  | 'period_end'
  | 'goal'
  | 'card'
  | 'full_time'
  | 'substitution'

/** Fire-and-forget coach → parent push via `/api/send-web-push`. Never throws into the live UI. */
export function notifyWebPush(input: {
  eventType: WebPushEventType
  title: string
  body: string
  teamId: string
  /** Prefer slug so notification deep-links to `/hub/:slug`. */
  teamSlug?: string | null
  playerId?: string | null
  url?: string
  /** When true, skip parent notifications (staff test matches). */
  isTest?: boolean
}): void {
  if (!ENABLE_PARENT_HUB) return
  if (input.isTest) return
  if (!input.teamId || !input.body.trim()) return

  void (async () => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (!session?.access_token) {
        console.warn('[web-push] no session — skip', input.eventType)
        return
      }

      const hubUrl = input.teamSlug
        ? buildParentHubUrl(input.teamSlug)
        : buildParentHubUrlByTeamId(input.teamId)

      const response = await fetch('/api/send-web-push', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          eventType: input.eventType,
          title: input.title,
          body: input.body.trim(),
          teamId: input.teamId,
          playerId: input.playerId ?? null,
          url: input.url ?? hubUrl,
          tag: `vvfc-${input.eventType}`,
        }),
      })

      const detail = await response.text().catch(() => '')
      if (!response.ok) {
        console.warn('[web-push]', input.eventType, response.status, detail)
        window.dispatchEvent(
          new CustomEvent('vvfc-web-push-result', {
            detail: { ok: false, eventType: input.eventType, status: response.status },
          }),
        )
        return
      }

      let parsed: { recipients?: number; sent?: number; failed?: number } = {}
      try {
        parsed = JSON.parse(detail) as typeof parsed
      } catch {
        // ignore
      }
      const recipients = parsed.recipients ?? 0
      const sent = parsed.sent ?? 0
      if (recipients === 0 || sent === 0) {
        console.warn('[web-push] no devices delivered', input.eventType, parsed)
      }
      window.dispatchEvent(
        new CustomEvent('vvfc-web-push-result', {
          detail: {
            ok: true,
            eventType: input.eventType,
            recipients,
            sent,
            failed: parsed.failed ?? 0,
          },
        }),
      )
    } catch (err) {
      console.warn('[web-push]', input.eventType, err)
    }
  })()
}

/**
 * Match clocks reset each half, so parent timeline order must use wall time
 * (`createdAt`), not period-relative `timestamp`.
 */
export function sortParentLiveTimelineNewestFirst(
  events: ParentLiveEvent[],
): ParentLiveEvent[] {
  return [...events].sort(
    (a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id),
  )
}

/**
 * Infer 1H/2H/… from chronology: a new starting-lineup batch after non-lineup
 * events means the next period (period-end rows are filtered out of the feed).
 */
export function assignParentEventPeriodIndexes(
  events: ParentLiveEvent[],
): Map<string, number> {
  const chrono = [...events].sort(
    (a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
  )
  let period = 1
  let hadNonLineupInPeriod = false
  const periodById = new Map<string, number>()

  for (const event of chrono) {
    const isLineup = isStartingLineupEvent(
      event.eventType,
      event.eventNotes,
      event.timestamp,
    )
    if (isLineup && hadNonLineupInPeriod) {
      period += 1
      hadNonLineupInPeriod = false
    }
    if (!isLineup) {
      hadNonLineupInPeriod = true
    }
    periodById.set(event.id, period)
  }

  return periodById
}

function formatLineupPlayerChip(event: ParentLiveEvent): string {
  const name = event.playerName?.trim() || 'Player'
  const withNumber =
    event.jersey != null ? `#${event.jersey} ${name}` : name
  const position = parseStartingLineupPosition(event.eventNotes)
  return position ? `${withNumber} (${position})` : withNumber
}

export type ParentTimelineRow =
  | {
      kind: 'event'
      id: string
      sortAt: string
      periodIndex: number
      event: ParentLiveEvent
    }
  | {
      kind: 'lineup'
      id: string
      sortAt: string
      periodIndex: number
      label: string
      players: string[]
    }
  | {
      kind: 'period_end'
      id: string
      sortAt: string
      periodIndex: number
      label: string
    }
  | {
      kind: 'switch'
      id: string
      sortAt: string
      periodIndex: number
      label: string
    }

const PARENT_HUB_TIME_ZONE = 'America/New_York'
const POSITION_SWITCH_GROUP_MS = 2500

export function formatParentHubWallClock(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('en-US', {
    timeZone: PARENT_HUB_TIME_ZONE,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(date)
}

export function withParentHubWallClock(line: string, iso: string): string {
  const clock = formatParentHubWallClock(iso)
  return clock ? `${line} · ${clock}` : line
}

export function formatParentPeriodEndedLabel(
  periodIndex: number,
  totalPeriods?: number | null,
): string {
  if (totalPeriods === 3) {
    const labels = ['1st period ended', '2nd period ended', '3rd period ended'] as const
    return labels[Math.min(3, Math.max(1, periodIndex)) - 1] ?? `${periodIndex}th period ended`
  }
  return periodIndex <= 1 ? '1st half ended' : '2nd half ended'
}

function synthesizePeriodEndRows(
  events: ParentLiveEvent[],
  totalPeriods?: number | null,
): Extract<ParentTimelineRow, { kind: 'period_end' }>[] {
  const periodById = assignParentEventPeriodIndexes(events)
  const groups = new Map<number, ParentLiveEvent[]>()
  for (const event of events) {
    if (!isPeriodEndSubEvent(event.eventType, event.eventNotes)) continue
    const period = periodById.get(event.id) ?? 1
    const bucket = groups.get(period) ?? []
    bucket.push(event)
    groups.set(period, bucket)
  }

  const rows: Extract<ParentTimelineRow, { kind: 'period_end' }>[] = []
  for (const [periodIndex, batch] of groups) {
    const chrono = [...batch].sort(
      (a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
    )
    const newest = chrono[chrono.length - 1]!
    rows.push({
      kind: 'period_end',
      id: `period-end-${periodIndex}-${chrono[0]!.id}`,
      sortAt: newest.createdAt,
      periodIndex,
      label: formatParentPeriodEndedLabel(periodIndex, totalPeriods),
    })
  }
  return rows
}

/**
 * Hide the auto-inserted shot that accompanies a goal or a save so the feed
 * shows one card, not "shot" + "goal" or "shot" + "save".
 */
export function hidePairedParentShots(events: ParentLiveEvent[]): ParentLiveEvent[] {
  const hide = new Set<string>()
  const takeShot = (type: 'shot_home' | 'shot_away', timestamp: number) => {
    const shot = events.find(
      (event) =>
        event.eventType === type && event.timestamp === timestamp && !hide.has(event.id),
    )
    if (shot) hide.add(shot.id)
  }

  for (const event of events) {
    if (event.eventType === 'goal') takeShot('shot_home', event.timestamp)
    if (event.eventType === 'opponent_goal') takeShot('shot_away', event.timestamp)
    if (event.eventType === 'save_home') takeShot('shot_away', event.timestamp)
    if (event.eventType === 'save_away') takeShot('shot_home', event.timestamp)
  }

  return events.filter((event) => !hide.has(event.id))
}

function createdAtMs(iso: string): number {
  const value = new Date(iso).getTime()
  return Number.isNaN(value) ? 0 : value
}

function formatPositionSwitchPart(event: ParentLiveEvent): string {
  const name = event.playerName?.trim() || 'Player'
  const parsed = parsePositionSwitchNote(event.eventNotes)
  if (parsed?.from && parsed.to) return `${name} ${parsed.from} ${parsed.to}`
  if (parsed?.to) return `${name} ${parsed.to}`
  return name
}

export function formatPositionSwitchLabel(events: ParentLiveEvent[]): string {
  return `Switched Position: ${events.map(formatPositionSwitchPart).join(' and ')}`
}

function synthesizePositionSwitchRows(
  events: ParentLiveEvent[],
  periodById: Map<string, number>,
): { rows: Extract<ParentTimelineRow, { kind: 'switch' }>[]; usedIds: Set<string> } {
  const usedIds = new Set<string>()
  const rows: Extract<ParentTimelineRow, { kind: 'switch' }>[] = []
  const changes = events.filter((event) => event.eventType === 'position_change')

  for (const event of changes) {
    if (usedIds.has(event.id)) continue
    const anchor = createdAtMs(event.createdAt)
    const batch = changes.filter((candidate) => {
      if (usedIds.has(candidate.id)) return false
      if (candidate.timestamp !== event.timestamp) return false
      return Math.abs(createdAtMs(candidate.createdAt) - anchor) <= POSITION_SWITCH_GROUP_MS
    })
    for (const member of batch) usedIds.add(member.id)
    const chrono = [...batch].sort(
      (a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
    )
    const newest = chrono[chrono.length - 1]!
    rows.push({
      kind: 'switch',
      id: `switch-${chrono[0]!.id}`,
      sortAt: newest.createdAt,
      periodIndex: periodById.get(event.id) ?? 1,
      label: formatPositionSwitchLabel(chrono),
    })
  }

  return { rows, usedIds }
}

/**
 * Collapse per-player starting-lineup `sub_in` rows into one timeline card per
 * period so parents see a single "Starting lineup" notice, not nine.
 */
export function buildParentTimelineRows(
  events: ParentLiveEvent[],
  options?: { totalPeriods?: number | null },
): ParentTimelineRow[] {
  const filtered = hidePairedParentShots(filterParentLiveTimeline(events))
  const periodById = assignParentEventPeriodIndexes(events)
  const lineupByPeriod = new Map<number, ParentLiveEvent[]>()
  const switches = synthesizePositionSwitchRows(filtered, periodById)
  const other: ParentLiveEvent[] = []

  for (const event of filtered) {
    if (isStartingLineupEvent(event.eventType, event.eventNotes, event.timestamp)) {
      const period = periodById.get(event.id) ?? 1
      const bucket = lineupByPeriod.get(period) ?? []
      bucket.push(event)
      lineupByPeriod.set(period, bucket)
      continue
    }
    if (switches.usedIds.has(event.id)) continue
    other.push(event)
  }

  const rows: ParentTimelineRow[] = other.map((event) => ({
    kind: 'event' as const,
    id: event.id,
    sortAt: event.createdAt,
    periodIndex: periodById.get(event.id) ?? 1,
    event,
  }))

  for (const [periodIndex, lineupEvents] of lineupByPeriod) {
    const chrono = [...lineupEvents].sort(
      (a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
    )
    const newest = chrono[chrono.length - 1]!
    const label = `${periodIndex}H lineup`
    rows.push({
      kind: 'lineup',
      id: `lineup-${periodIndex}-${chrono[0]!.id}`,
      sortAt: newest.createdAt,
      periodIndex,
      label,
      players: chrono.map(formatLineupPlayerChip),
    })
  }

  rows.push(...switches.rows)
  rows.push(...synthesizePeriodEndRows(events, options?.totalPeriods))

  return rows.sort(
    (a, b) => b.sortAt.localeCompare(a.sortAt) || b.id.localeCompare(a.id),
  )
}

export function formatParentEventLine(
  event: ParentLiveEvent,
  opponent: string,
  options?: { periodIndex?: number; teamName?: string },
): string {
  const periodIndex = options?.periodIndex ?? 1
  const periodPrefix = `${periodIndex}H `
  const minute = `${periodPrefix}${Math.max(0, Math.floor(event.timestamp / 60))}'`
  const name = event.playerName?.trim() || 'Player'
  const opponentLabel = opponent.trim() || 'Opponent'
  const teamLabel = options?.teamName?.trim() || 'Home'
  const position = parseTacticalPositionNote(event.eventNotes)

  let line: string
  if (isStartingLineupEvent(event.eventType, event.eventNotes, event.timestamp)) {
    const lineupPosition = parseStartingLineupPosition(event.eventNotes)
    const lineupLabel = `${periodIndex}H lineup`
    line = lineupPosition
      ? `${lineupLabel} · ${name} · ${lineupPosition}`
      : `${lineupLabel} · ${name}`
  } else {
    switch (event.eventType) {
      case 'goal':
        line = `${minute} GOAL · ${name}${event.isPk ? ' (PK)' : ''}${
          event.assistPlayerName ? ` · Assist by ${event.assistPlayerName}` : ''
        }`
        break
      case 'opponent_goal':
        line = `${minute} ${opponentLabel} Goal${event.isPk ? ' (PK)' : ''}`
        break
      case 'yellow_card':
        line = `${minute} Yellow · ${name}`
        break
      case 'red_card':
        line = `${minute} Red · ${name}`
        break
      case 'sub_in':
        line = position
          ? `${minute} Sub ON · ${name} · ${position}`
          : `${minute} Sub ON · ${name}`
        break
      case 'sub_out':
        line = `${minute} Sub OFF · ${name}`
        break
      case 'position_change':
        line = `${minute} ${formatPositionSwitchLabel([event])}`
        break
      case 'shot_home':
        line = `${minute} Shot · ${teamLabel}`
        break
      case 'shot_away':
        line = `${minute} Shot · ${opponentLabel}`
        break
      case 'save_home': {
        const gkName = event.playerName?.trim()
        line = gkName
          ? `${minute} Shot by ${opponentLabel}, Save by ${gkName}`
          : `${minute} Save by ${teamLabel}`
        break
      }
      case 'save_away':
        line = `${minute} Save by ${opponentLabel}`
        break
      case 'corner_home':
        line = `${minute} Corner · ${teamLabel}`
        break
      case 'corner_away':
        line = `${minute} Corner · ${opponentLabel}`
        break
      default:
        line = `${minute} ${event.eventType}`
    }
  }

  return withParentHubWallClock(line, event.createdAt)
}

export function formatParentTimelineRowCopy(
  row: ParentTimelineRow,
  opponent: string,
  options?: { teamName?: string },
): { title: string; detail?: string } {
  const periodPrefix = `${row.periodIndex}H `
  if (row.kind === 'lineup') {
    return {
      title: withParentHubWallClock(row.label, row.sortAt),
      detail: row.players.join(' · '),
    }
  }
  if (row.kind === 'period_end') {
    return { title: withParentHubWallClock(`${periodPrefix}${row.label}`, row.sortAt) }
  }
  if (row.kind === 'switch') {
    return { title: withParentHubWallClock(`${periodPrefix}${row.label}`, row.sortAt) }
  }
  return {
    title: formatParentEventLine(row.event, opponent, {
      periodIndex: row.periodIndex,
      teamName: options?.teamName,
    }),
  }
}

export function isParentTimelineHighlight(row: ParentTimelineRow): boolean {
  if (row.kind === 'lineup' || row.kind === 'period_end') return true
  if (row.kind !== 'event') return false
  return row.event.eventType === 'goal' || row.event.eventType === 'opponent_goal'
}

/** Event types shown on the public Parent Hub live timeline. */
export const PARENT_HUB_LIVE_EVENT_TYPES = [
  'goal',
  'opponent_goal',
  'yellow_card',
  'red_card',
  'sub_in',
  'sub_out',
  'position_change',
  'shot_home',
  'shot_away',
  'save_home',
  'save_away',
  'corner_home',
  'corner_away',
] as const

export type ParentHubLiveEventType = (typeof PARENT_HUB_LIVE_EVENT_TYPES)[number]

export function isParentHubLiveEventType(value: string): value is ParentHubLiveEventType {
  return (PARENT_HUB_LIVE_EVENT_TYPES as readonly string[]).includes(value)
}

/**
 * Parent timeline rules:
 * - Collapse kickoff/period starters into one grouped "Starting lineup" card
 * - Hide period-end mass sub-offs (shown as one "half ended" card instead)
 * - Hide legacy untagged kickoff sub_out noise
 */
export function shouldShowParentLiveEvent(
  event: Pick<ParentLiveEvent, 'eventType' | 'timestamp' | 'eventNotes'>,
): boolean {
  if (!isParentHubLiveEventType(event.eventType)) return false
  if (isPeriodEndSubEvent(event.eventType, event.eventNotes)) return false
  if (isStartingLineupEvent(event.eventType, event.eventNotes, event.timestamp)) return true
  if ((event.eventType === 'sub_in' || event.eventType === 'sub_out') && event.timestamp <= 0) {
    return false
  }
  return true
}

/** Keep period-end markers in memory so the timeline can emit a half-ended card. */
export function isParentHubTrackedLiveEvent(
  event: Pick<ParentLiveEvent, 'eventType' | 'eventNotes'>,
): boolean {
  if (isPeriodEndSubEvent(event.eventType, event.eventNotes)) return true
  return isParentHubLiveEventType(event.eventType)
}

type MatchEventLike = {
  id: string
  match_id: string
  player_id: string | null
  event_type: string
  timestamp: number
  event_notes: string | null
  assist_player_id: string | null
  is_pk?: boolean | null
  created_at: string
}

type NamedPlayerLike = {
  id: string
  firstName: string
  lastName: string
  number: number | null
}

/** Staff recap → the same event shape Parent Hub uses (no public RPC). */
export function parentLiveEventsFromMatchEvents(
  events: MatchEventLike[],
  players: NamedPlayerLike[],
): ParentLiveEvent[] {
  const byId = new Map(players.map((player) => [player.id, player] as const))
  const nameOf = (playerId: string | null) => {
    if (!playerId) return null
    const player = byId.get(playerId)
    return player ? formatPlayerFullName(player.firstName, player.lastName) : null
  }

  return events
    .filter((event) => {
      const tracked = isParentHubTrackedLiveEvent({
        eventType: event.event_type,
        eventNotes: event.event_notes,
      })
      if (!tracked) return false
      if (
        event.event_type === 'sub_out' &&
        event.timestamp <= 0 &&
        !isPeriodEndSubEvent(event.event_type, event.event_notes)
      ) {
        return false
      }
      return true
    })
    .map((event) => {
      const player = event.player_id ? byId.get(event.player_id) : undefined
      return {
        id: event.id,
        matchId: event.match_id,
        playerId: event.player_id,
        playerName: nameOf(event.player_id),
        jersey: player?.number ?? null,
        eventType: event.event_type,
        timestamp: event.timestamp,
        eventNotes: event.event_notes,
        isPk: event.is_pk ?? false,
        assistPlayerId: event.assist_player_id,
        assistPlayerName: nameOf(event.assist_player_id),
        createdAt: event.created_at,
      }
    })
}

export function toParentHubPlayers(players: NamedPlayerLike[]): ParentHubPlayer[] {
  return players.map((player) => ({
    id: player.id,
    firstName: player.firstName,
    lastName: player.lastName,
    number: player.number,
  }))
}

/**
 * Hide untagged mass sub-offs at the same clock second (half/full-time clears).
 * Tagged `period_end` rows stay in the raw list and become a single period-end card.
 */
export function filterParentLiveTimeline(events: ParentLiveEvent[]): ParentLiveEvent[] {
  const subOutCounts = new Map<number, number>()
  for (const event of events) {
    if (event.eventType !== 'sub_out') continue
    subOutCounts.set(event.timestamp, (subOutCounts.get(event.timestamp) ?? 0) + 1)
  }
  const massSubOutTimestamps = new Set<number>()
  for (const [timestamp, count] of subOutCounts) {
    if (count >= 5) massSubOutTimestamps.add(timestamp)
  }

  return events.filter((event) => {
    if (!shouldShowParentLiveEvent(event)) return false
    if (event.eventType === 'sub_out' && massSubOutTimestamps.has(event.timestamp)) return false
    return true
  })
}
