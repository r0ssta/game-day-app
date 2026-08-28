import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'
import {
  corsHeaders,
  jsonResponse,
  sendPushToSubscriptions,
  type PushSubscriptionRow,
} from '../_shared/web-push.ts'

const GENERAL_EVENT_TYPES = new Set([
  'match_start',
  'period_start',
  'period_end',
  'goal',
  'card',
  'full_time',
])

type NotifyBody = {
  eventType?: string
  title?: string
  body?: string
  teamId?: string
  playerId?: string | null
  url?: string
  tag?: string
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  try {
    const input = (await req.json()) as NotifyBody
    const eventType = input.eventType?.trim()
    const title = input.title?.trim() || 'Virginia Velocity'
    const body = input.body?.trim()
    const teamId = input.teamId?.trim()
    const playerId = input.playerId?.trim() || null

    if (!eventType || !body || !teamId) {
      return jsonResponse(
        { error: 'eventType, body, and teamId are required' },
        400,
      )
    }

    const isSub = eventType === 'substitution'
    const isGeneral = GENERAL_EVENT_TYPES.has(eventType)
    if (!isSub && !isGeneral) {
      return jsonResponse({ error: `Unsupported eventType: ${eventType}` }, 400)
    }
    if (isSub && !playerId) {
      return jsonResponse(
        { error: 'playerId is required for substitution events' },
        400,
      )
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!supabaseUrl || !serviceKey) {
      return jsonResponse({ error: 'Server misconfigured' }, 500)
    }

    const admin = createClient(supabaseUrl, serviceKey)

    let query = admin
      .from('web_push_subscriptions')
      .select('id, endpoint, p256dh, auth, target_player_id')
      .eq('team_id', teamId)

    if (isSub) {
      query = query.eq('target_player_id', playerId!)
    }

    const { data: rows, error } = await query
    if (error) {
      console.error('[send-web-push] query', error)
      return jsonResponse({ error: 'Failed to load subscriptions' }, 500)
    }

    const subscriptions = (rows ?? []) as PushSubscriptionRow[]
    if (subscriptions.length === 0) {
      return jsonResponse({ ok: true, sent: 0, failed: 0, recipients: 0 })
    }

    const result = await sendPushToSubscriptions(subscriptions, {
      title,
      body,
      url: input.url,
      tag: input.tag ?? `vvfc-${eventType}`,
    })

    if (result.goneIds.length > 0) {
      await admin.from('web_push_subscriptions').delete().in('id', result.goneIds)
    }

    return jsonResponse({
      ok: true,
      recipients: subscriptions.length,
      sent: result.sent,
      failed: result.failed,
      pruned: result.goneIds.length,
      eventType,
    })
  } catch (err) {
    console.error('[send-web-push]', err)
    return jsonResponse(
      { error: err instanceof Error ? err.message : 'Send failed' },
      500,
    )
  }
})
