import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'
import webpush from 'web-push'

type SendBody = {
  teamId?: string
  title?: string
  body?: string
  url?: string
  tag?: string
  /** When set, only subscribers opted into this player (substitution alerts). */
  playerId?: string | null
  eventType?: string
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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Headers', 'authorization, content-type')
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
    return res.status(200).end()
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const authHeader = req.headers.authorization
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authorization required' })
    }

    const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
    const supabaseKey =
      process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
      process.env.SUPABASE_ANON_KEY ||
      process.env.SUPABASE_PUBLISHABLE_KEY

    if (!supabaseUrl || !supabaseKey) {
      return res.status(500).json({ error: 'Supabase env not configured' })
    }

    configureVapid()

    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } },
    })

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) {
      return res.status(401).json({ error: 'Invalid session' })
    }

    const input = (typeof req.body === 'string' ? JSON.parse(req.body) : req.body) as SendBody
    const teamId = input.teamId?.trim()
    const title = input.title?.trim() || 'Virginia Velocity'
    const body = input.body?.trim()
    const playerId = input.playerId?.trim() || null

    if (!teamId || !body) {
      return res.status(400).json({ error: 'teamId and body are required' })
    }

    let query = supabase
      .from('web_push_subscriptions')
      .select('id, endpoint, p256dh, auth')
      .eq('team_id', teamId)

    if (playerId) {
      query = query.eq('target_player_id', playerId)
    }

    const { data: rows, error: queryError } = await query
    if (queryError) {
      console.error('[api/send-web-push] query', queryError)
      return res.status(500).json({ error: 'Failed to load subscriptions' })
    }

    const subscriptions = (rows ?? []) as SubscriptionRow[]
    if (subscriptions.length === 0) {
      return res.status(200).json({ ok: true, sent: 0, failed: 0, pruned: 0, recipients: 0 })
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
        // Parent uninstalled / endpoint expired — drop the row.
        if (statusCode === 404 || statusCode === 410) {
          goneIds.push(row.id)
        }
        console.error('[api/send-web-push] send failed', row.endpoint.slice(0, 48), err)
      }
    }

    if (goneIds.length > 0) {
      const { error: deleteError } = await supabase
        .from('web_push_subscriptions')
        .delete()
        .in('id', goneIds)
      if (deleteError) {
        console.error('[api/send-web-push] prune failed', deleteError)
      }
    }

    return res.status(200).json({
      ok: true,
      recipients: subscriptions.length,
      sent,
      failed,
      pruned: goneIds.length,
      eventType: input.eventType ?? null,
    })
  } catch (err) {
    console.error('[api/send-web-push]', err)
    return res.status(500).json({
      error: err instanceof Error ? err.message : 'Send failed',
    })
  }
}
