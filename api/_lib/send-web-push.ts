import type { SupabaseClient } from '@supabase/supabase-js'
import webpush from 'web-push'
import { reportApiError } from './sentry'

export type SendWebPushInput = {
  teamId: string
  title?: string
  body: string
  url?: string
  tag?: string
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

function configureVapid() {
  const publicKey = process.env.VITE_VAPID_PUBLIC_KEY || process.env.VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  const subject = process.env.VAPID_SUBJECT || 'mailto:admin@virginiavelocity.com'

  if (!publicKey || !privateKey) {
    throw new Error('Missing VITE_VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY')
  }

  webpush.setVapidDetails(subject, publicKey, privateKey)
}

/**
 * Fan out a web push to Parent Hub subscribers for a team.
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
    url: input.url ?? '/',
    tag: input.tag ?? 'vvfc-match',
  })

  let sent = 0
  let failed = 0
  const goneIds: string[] = []

  for (const row of subscriptions) {
    try {
      await webpush.sendNotification(
        {
          endpoint: row.endpoint,
          keys: { p256dh: row.p256dh, auth: row.auth },
        },
        payload,
        { TTL: 60 * 60 },
      )
      sent += 1
    } catch (err) {
      failed += 1
      const statusCode =
        err && typeof err === 'object' && 'statusCode' in err
          ? Number((err as { statusCode?: number }).statusCode)
          : 0
      if (statusCode === 404 || statusCode === 410) {
        goneIds.push(row.id)
      }
      console.error('[sendTeamWebPush] send failed', row.endpoint.slice(0, 48), err)
    }
  }

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

/** Fire-and-forget wrapper — never throws to the match write path. */
export function queueTeamWebPush(supabase: SupabaseClient, input: SendWebPushInput): void {
  void sendTeamWebPush(supabase, input).catch((err) => {
    void reportApiError('[queueTeamWebPush]', err, { eventType: input.eventType })
  })
}
