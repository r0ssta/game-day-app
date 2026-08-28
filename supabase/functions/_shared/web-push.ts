import webpush from 'npm:web-push@3.6.7'

export const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
}

export function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

export function configureWebPush() {
  const publicKey = Deno.env.get('VAPID_PUBLIC_KEY')
  const privateKey = Deno.env.get('VAPID_PRIVATE_KEY')
  const subject = Deno.env.get('VAPID_SUBJECT') || 'mailto:admin@virginiavelocity.com'

  if (!publicKey || !privateKey) {
    throw new Error('Missing VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY secrets')
  }

  webpush.setVapidDetails(subject, publicKey, privateKey)
  return webpush
}

export type PushSubscriptionRow = {
  id: string
  endpoint: string
  p256dh: string
  auth: string
  target_player_id: string | null
}

export async function sendPushToSubscriptions(
  rows: PushSubscriptionRow[],
  payload: { title: string; body: string; url?: string; tag?: string },
): Promise<{ sent: number; failed: number; goneIds: string[] }> {
  const push = configureWebPush()
  let sent = 0
  let failed = 0
  const goneIds: string[] = []

  const body = JSON.stringify({
    title: payload.title,
    body: payload.body,
    url: payload.url ?? '/',
    tag: payload.tag ?? 'vvfc-match',
  })

  for (const row of rows) {
    try {
      await push.sendNotification(
        {
          endpoint: row.endpoint,
          keys: { p256dh: row.p256dh, auth: row.auth },
        },
        body,
        { TTL: 60 * 60 },
      )
      sent += 1
    } catch (err) {
      failed += 1
      const statusCode =
        err && typeof err === 'object' && 'statusCode' in err
          ? Number((err as { statusCode?: number }).statusCode)
          : 0
      // 404 / 410 = subscription gone — clean up later
      if (statusCode === 404 || statusCode === 410) {
        goneIds.push(row.id)
      }
      console.error('[web-push] send failed', row.endpoint.slice(0, 48), err)
    }
  }

  return { sent, failed, goneIds }
}
