import type { SupabaseClient } from '@supabase/supabase-js'
import webpush from 'web-push'
import { reportApiError } from './sentry.js'
import { requireVapidConfig } from './server-env.js'

const DEFAULT_PUSH_ICON = '/branding/virginia-velocity-crest.png'

/** Standard Web Push notification fields shown by the Parent Hub service worker. */
export type WebPushPayload = {
  title: string
  body: string
  icon: string
  badge: string
  url: string
  tag?: string
}

export type SendWebPushInput = {
  teamId: string
  title?: string
  body: string
  url?: string
  tag?: string
  icon?: string
  badge?: string
  playerId?: string | null
  eventType?: string
}

export type SendWebPushResult = {
  ok: true
  recipients: number
  sent: number
  failed: number
  pruned: number
  eventType: string | null
}

type SubscriptionRow = {
  id: string
  endpoint: string
  p256dh: string
  auth: string
}

/**
 * Live match alerts. `urgency: high` maps to APNs priority 10 so iOS does not
 * delay or drop them. No `topic` — APNs collapses notifications that share one.
 * `timeout` caps a dead endpoint so the match handler can still return.
 */
export const LIVE_PUSH_OPTIONS = {
  TTL: 60 * 60,
  urgency: 'high' as const,
  timeout: 5_000,
}

/** One tag per goal so a later score does not replace the previous alert. */
export function goalPushTag(input: {
  matchId: string
  ourGoal: boolean
  homeScore: number
  awayScore: number
  timestamp: number
}): string {
  const side = input.ourGoal ? 'us' : 'them'
  return `vvfc-goal-${input.matchId}-${side}-${input.homeScore}-${input.awayScore}-${input.timestamp}`
}

function configureVapid() {
  const { publicKey, privateKey, subject } = requireVapidConfig()
  webpush.setVapidDetails(subject, publicKey, privateKey)
}

/**
 * Single parent-notification pipeline for live match events (goal, period, card,
 * full time, PKs) and the `/api/send-web-push` HTTP wrapper.
 * Uses the caller's user-scoped Supabase client (RLS applies).
 * Failures are logged and returned as soft results — match writes should not roll back.
 */
export async function sendTeamWebPush(
  supabase: SupabaseClient,
  input: SendWebPushInput,
): Promise<SendWebPushResult> {
  configureVapid()

  const teamId = input.teamId.trim()
  const title = input.title?.trim() || 'Virginia Velocity'
  const body = input.body.trim()
  const playerId = input.playerId?.trim() || null

  let query = supabase
    .from('web_push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('team_id', teamId)

  if (playerId) {
    query = query.eq('target_player_id', playerId)
  }

  const { data: rows, error: queryError } = await query
  if (queryError) {
    console.error('[sendTeamWebPush] query', queryError)
    throw new Error('Failed to load subscriptions')
  }

  const subscriptions = ((rows ?? []) as SubscriptionRow[]).filter((row) => {
    try {
      const host = new URL(row.endpoint).hostname
      return host !== 'example.com' && !host.endsWith('.example')
    } catch {
      return false
    }
  })

  if (subscriptions.length === 0) {
    return {
      ok: true,
      sent: 0,
      failed: 0,
      pruned: 0,
      recipients: 0,
      eventType: input.eventType ?? null,
    }
  }

  const payload = JSON.stringify({
    title,
    body,
    icon: input.icon?.trim() || DEFAULT_PUSH_ICON,
    badge: input.badge?.trim() || DEFAULT_PUSH_ICON,
    url: input.url ?? '/',
    tag: input.tag ?? 'vvfc-match',
  } satisfies WebPushPayload)

  const outcomes = await Promise.all(
    subscriptions.map(async (row) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: row.endpoint,
            keys: { p256dh: row.p256dh, auth: row.auth },
          },
          payload,
          LIVE_PUSH_OPTIONS,
        )
        return { sent: true, goneId: null as string | null }
      } catch (err) {
        const statusCode =
          err && typeof err === 'object' && 'statusCode' in err
            ? Number((err as { statusCode?: number }).statusCode)
            : 0
        console.error('[sendTeamWebPush] send failed', row.endpoint.slice(0, 48), err)
        return {
          sent: false,
          goneId: statusCode === 404 || statusCode === 410 ? row.id : null,
        }
      }
    }),
  )

  const sent = outcomes.filter((outcome) => outcome.sent).length
  const failed = outcomes.length - sent
  const goneIds = outcomes.flatMap((outcome) => (outcome.goneId ? [outcome.goneId] : []))

  if (goneIds.length > 0) {
    const { error: deleteError } = await supabase
      .from('web_push_subscriptions')
      .delete()
      .in('id', goneIds)
    if (deleteError) {
      console.error('[sendTeamWebPush] prune failed', deleteError)
    }
  }

  return {
    ok: true,
    recipients: subscriptions.length,
    sent,
    failed,
    pruned: goneIds.length,
    eventType: input.eventType ?? null,
  }
}

/**
 * Awaited by match handlers so the serverless invocation stays alive until the
 * push leaves. Never throws — a delivery failure must not fail the match write.
 */
export async function queueTeamWebPush(
  supabase: SupabaseClient,
  input: SendWebPushInput,
): Promise<void> {
  try {
    await sendTeamWebPush(supabase, input)
  } catch (err) {
    await reportApiError('[queueTeamWebPush]', err, { eventType: input.eventType })
  }
}
