import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders, jsonResponse } from '../_shared/web-push.ts'

type SubscribeBody = {
  teamId?: string
  targetPlayerId?: string | null
  subscription?: {
    endpoint?: string
    keys?: { p256dh?: string; auth?: string }
  }
  userAgent?: string | null
}

function resolveServiceRoleKey(): string {
  const legacy = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim()
  if (legacy) return legacy

  const raw = Deno.env.get('SUPABASE_SECRET_KEYS')?.trim()
  if (!raw) return ''
  try {
    const parsed = JSON.parse(raw) as Record<string, string>
    return (
      parsed.default?.trim() ||
      parsed.service_role?.trim() ||
      Object.values(parsed).find((value) => typeof value === 'string' && value.trim())?.trim() ||
      ''
    )
  } catch {
    return ''
  }
}

function createAdminClient(): SupabaseClient {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = resolveServiceRoleKey()
  if (!supabaseUrl || !serviceKey) {
    throw new Error('Server misconfigured (missing admin API key)')
  }
  return createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  try {
    const body = (await req.json()) as SubscribeBody
    const teamId = body.teamId?.trim()
    const endpoint = body.subscription?.endpoint?.trim()
    const p256dh = body.subscription?.keys?.p256dh?.trim()
    const auth = body.subscription?.keys?.auth?.trim()
    const targetPlayerId =
      body.targetPlayerId && body.targetPlayerId.trim()
        ? body.targetPlayerId.trim()
        : null

    if (!teamId || !endpoint || !p256dh || !auth) {
      return jsonResponse(
        { error: 'teamId and a valid PushSubscription are required' },
        400,
      )
    }

    const admin = createAdminClient()

    const { data: team, error: teamError } = await admin
      .from('teams')
      .select('id')
      .eq('id', teamId)
      .maybeSingle()
    if (teamError) {
      console.error('[subscribe-web-push] team lookup', teamError)
      return jsonResponse({ error: 'Could not verify team' }, 500)
    }
    if (!team) return jsonResponse({ error: 'Team not found' }, 404)

    if (targetPlayerId) {
      const { data: player } = await admin
        .from('players')
        .select('id')
        .eq('id', targetPlayerId)
        .maybeSingle()
      if (!player) return jsonResponse({ error: 'Player not found' }, 400)
    }

    const { error } = await admin.from('web_push_subscriptions').upsert(
      {
        endpoint,
        p256dh,
        auth,
        team_id: teamId,
        target_player_id: targetPlayerId,
        user_agent: body.userAgent?.slice(0, 400) ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'endpoint' },
    )

    if (error) {
      console.error('[subscribe-web-push]', error)
      return jsonResponse({ error: 'Could not save subscription' }, 500)
    }

    return jsonResponse({ ok: true })
  } catch (err) {
    console.error('[subscribe-web-push]', err)
    return jsonResponse(
      { error: err instanceof Error ? err.message : 'Subscribe failed' },
      500,
    )
  }
})
