import { formatPlayerFullName } from '@/lib/player-names'
import { formatPeriodLong, type TotalPeriods } from '@/lib/match-periods'
import {
  isPeriodEndSubEvent,
  isStartingLineupEvent,
  parseStartingLineupPosition,
} from '@/lib/match-event-notes'
import { supabase } from '@/supabaseClient'
import { ENABLE_PARENT_HUB } from '@/lib/feature-flags'
import {
  isIosDevice,
  isStandalonePwa,
  readRememberedParentHubSlug,
} from '@/lib/parent-hub-pwa'

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
  status: 'active' | 'scheduled' | 'pending_review' | 'completed'
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
  const payload = data as ParentHubPayload
  if (!payload?.teamId) throw new Error('Team hub not found')
  return {
    teamId: payload.teamId,
    teamSlug: payload.teamSlug || '',
    teamName: payload.teamName,
    ageGroup: payload.ageGroup ?? null,
    brandColor: payload.brandColor ?? null,
    logoUrl: payload.logoUrl ?? null,
    players: Array.isArray(payload.players) ? payload.players : [],
    matches: Array.isArray(payload.matches) ? payload.matches : [],
  }
}

export async function fetchParentHub(route: ParentHubRoute): Promise<ParentHubPayload> {
  if (route.kind === 'slug') {
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

export async function fetchParentLiveEvents(matchId: string): Promise<ParentLiveEvent[]> {
  const { data, error } = await supabase.rpc('get_parent_live_events', {
    p_match_id: matchId,
  })
  if (error) throw error
  return Array.isArray(data) ? (data as ParentLiveEvent[]) : []
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

    const { Workbox } = await import('workbox-window')
    const wb = new Workbox('/sw.js', { scope: '/hub/' })
    let waitingForUpdate = false

    // Activate updated SW promptly so Parent Hub gets fresh shell + strategies.
    wb.addEventListener('waiting', () => {
      waitingForUpdate = true
      void wb.messageSkipWaiting()
    })
    wb.addEventListener('controlling', () => {
      if (!waitingForUpdate) return
      window.location.reload()
    })

    const registration = await wb.register({ immediate: true })
    // Pull the latest precache even when an older hub SW is already active.
    void registration?.update()
    return registration ?? (await navigator.serviceWorker.ready)
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

export function getLocalPushEnabled(teamId: string): boolean {
  try {
    return localStorage.getItem(pushEnabledStorageKey(teamId)) === '1'
  } catch {
    return false
  }
}

export function setLocalPushEnabled(teamId: string, enabled: boolean) {
  try {
    if (enabled) localStorage.setItem(pushEnabledStorageKey(teamId), '1')
    else localStorage.removeItem(pushEnabledStorageKey(teamId))
  } catch {
    // ignore quota / private mode
  }
}

/** True when this browser already has an active PushSubscription. */
export async function hasActivePushSubscription(): Promise<boolean> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false
  try {
    const registration =
      (await navigator.serviceWorker.getRegistration()) ??
      (await registerParentServiceWorker())
    if (!registration) return false
    await navigator.serviceWorker.ready
    const existing = await registration.pushManager.getSubscription()
    return Boolean(existing)
  } catch {
    return false
  }
}

export async function subscribeParentWebPush(input: {
  teamId: string
  targetPlayerId: string | null
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

  const registration =
    (await navigator.serviceWorker.getRegistration()) ??
    (await registerParentServiceWorker())
  if (!registration) throw new Error('Service worker could not be registered.')

  await navigator.serviceWorker.ready

  // Reuse an existing subscription when possible; otherwise create one with our VAPID key.
  let subscription = await registration.pushManager.getSubscription()
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

  const { error } = await supabase.rpc('subscribe_parent_web_push', {
    p_team_id: input.teamId,
    p_endpoint: json.endpoint,
    p_p256dh: json.keys.p256dh,
    p_auth: json.keys.auth,
    p_target_player_id: input.targetPlayerId,
    p_user_agent: navigator.userAgent,
  })
  if (error) throw error
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
}): void {
  if (!ENABLE_PARENT_HUB) return
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

      if (!response.ok) {
        const detail = await response.text().catch(() => '')
        console.warn('[web-push]', input.eventType, response.status, detail)
      }
    } catch (err) {
      console.warn('[web-push]', input.eventType, err)
    }
  })()
}

type NamedPlayer = {
  firstName: string
  lastName: string
  number: number | null
}

function playerLabel(player: NamedPlayer): string {
  const name = formatPlayerFullName(player.firstName, player.lastName)
  return player.number != null ? `#${player.number} ${name}` : name
}

export function buildMatchStartPush(input: {
  teamName: string
  opponent: string
  starters: NamedPlayer[]
  currentPeriod: number
  totalPeriods: TotalPeriods
}): { title: string; body: string } {
  const period = formatPeriodLong(input.currentPeriod, input.totalPeriods)
  const lineup =
    input.starters.length > 0
      ? input.starters.map(playerLabel).join(', ')
      : 'TBD'
  return {
    title: `${input.teamName} · Kickoff`,
    body: `${period} underway vs ${input.opponent || 'Opponent'}. XI: ${lineup}`,
  }
}

export function buildPeriodPush(input: {
  teamName: string
  opponent: string
  kind: 'start' | 'end'
  period: number
  totalPeriods: TotalPeriods
  homeScore?: number
  awayScore?: number
}): { title: string; body: string } {
  const label = formatPeriodLong(input.period, input.totalPeriods)
  if (input.kind === 'start') {
    return {
      title: `${input.teamName} · ${label}`,
      body: `${label} underway vs ${input.opponent || 'Opponent'}.`,
    }
  }
  return {
    title: `${input.teamName} · ${label} ended`,
    body: `Score ${input.homeScore ?? 0}–${input.awayScore ?? 0} vs ${input.opponent || 'Opponent'}.`,
  }
}

export function buildGoalPush(input: {
  teamName: string
  opponent: string
  homeScore: number
  awayScore: number
  scorerLabel?: string
  assistLabel?: string | null
  isPk?: boolean
  ourGoal: boolean
}): { title: string; body: string } {
  const score = `${input.homeScore}–${input.awayScore}`
  if (!input.ourGoal) {
    return {
      title: `${input.teamName} · Goal conceded`,
      body: `${input.opponent || 'Opponent'}${input.isPk ? ' PK' : ''} · ${score}`,
    }
  }
  const how = input.isPk
    ? 'PK'
    : input.assistLabel
      ? `assist ${input.assistLabel}`
      : 'unassisted'
  return {
    title: `${input.teamName} · GOAL!`,
    body: `${input.scorerLabel ?? 'Player'} (${how}) · ${score} vs ${input.opponent || 'Opponent'}`,
  }
}

export function buildCardPush(input: {
  playerLabel: string
  kind: 'yellow' | 'red'
  isSecondYellow?: boolean
}): { title: string; body: string } {
  if (input.kind === 'red' || input.isSecondYellow) {
    return {
      title: 'Red card',
      body: input.isSecondYellow
        ? `${input.playerLabel} sent off (2nd yellow).`
        : `${input.playerLabel} sent off.`,
    }
  }
  return { title: 'Yellow card', body: `${input.playerLabel} booked.` }
}

export function buildFullTimePush(input: {
  teamName: string
  opponent: string
  homeScore: number
  awayScore: number
  pkNote?: string
}): { title: string; body: string } {
  return {
    title: `${input.teamName} · Final`,
    body: `${input.homeScore}–${input.awayScore} vs ${input.opponent || 'Opponent'}${input.pkNote ? ` · ${input.pkNote}` : ''}`,
  }
}

export function buildSubstitutionPush(input: {
  playerLabel: string
  direction: 'ON' | 'OFF'
  currentPeriod: number
  totalPeriods: TotalPeriods
}): { title: string; body: string } {
  const period = formatPeriodLong(input.currentPeriod, input.totalPeriods)
  return {
    title: 'Substitution',
    body: `${input.playerLabel} is subbing ${input.direction} the pitch in ${period}.`,
  }
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

export function formatParentEventLine(
  event: ParentLiveEvent,
  opponent: string,
  options?: { periodIndex?: number },
): string {
  const periodIndex = options?.periodIndex ?? 1
  const periodPrefix = periodIndex > 1 ? `${periodIndex}H ` : ''
  const minute = `${periodPrefix}${Math.max(0, Math.floor(event.timestamp / 60))}'`
  const name = event.playerName?.trim() || 'Player'
  const opponentLabel = opponent.trim() || 'Opponent'

  if (isStartingLineupEvent(event.eventType, event.eventNotes, event.timestamp)) {
    const position = parseStartingLineupPosition(event.eventNotes)
    const lineupLabel = periodIndex > 1 ? `${periodIndex}H lineup` : 'Starting lineup'
    return position ? `${lineupLabel} · ${name} · ${position}` : `${lineupLabel} · ${name}`
  }

  switch (event.eventType) {
    case 'goal':
      return `${minute} GOAL · ${name}${event.isPk ? ' (PK)' : ''}${
        event.assistPlayerName ? ` · assist ${event.assistPlayerName}` : ''
      }`
    case 'opponent_goal':
      return `${minute} ${opponentLabel} goal${event.isPk ? ' (PK)' : ''}`
    case 'yellow_card':
      return `${minute} Yellow · ${name}`
    case 'red_card':
      return `${minute} Red · ${name}`
    case 'sub_in':
      return `${minute} Sub ON · ${name}`
    case 'sub_out':
      return `${minute} Sub OFF · ${name}`
    case 'shot_home':
      return `${minute} Shot · Home`
    case 'shot_away':
      return `${minute} Shot · ${opponentLabel}`
    case 'save_home':
      return `${minute} Save · ${name !== 'Player' ? name : 'Home'}`
    case 'save_away':
      return `${minute} Save · ${opponentLabel}`
    default:
      return `${minute} ${event.eventType}`
  }
}

/** Event types shown on the public Parent Hub live timeline. */
export const PARENT_HUB_LIVE_EVENT_TYPES = [
  'goal',
  'opponent_goal',
  'yellow_card',
  'red_card',
  'sub_in',
  'sub_out',
  'shot_home',
  'shot_away',
  'save_home',
  'save_away',
] as const

export type ParentHubLiveEventType = (typeof PARENT_HUB_LIVE_EVENT_TYPES)[number]

export function isParentHubLiveEventType(value: string): value is ParentHubLiveEventType {
  return (PARENT_HUB_LIVE_EVENT_TYPES as readonly string[]).includes(value)
}

/**
 * Parent timeline rules:
 * - Show kickoff/period starters as "Starting lineup · name · position"
 * - Hide period-end mass sub-offs
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

/**
 * Hide untagged mass sub-offs at the same clock second (half/full-time clears).
 * Tagged `period_end` rows are already excluded by shouldShowParentLiveEvent.
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
