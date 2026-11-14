import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'
import { reportApiError } from './_lib/sentry.js'
import { assertNoClientLeakedSecrets, requirePublishableSupabaseEnv } from './_lib/server-env.js'
import { buildTeamCalendarIcs, type TeamCalendarEvent } from '../src/lib/team-calendar.js'

function firstQueryValue(value: string | string[] | undefined): string | null {
  if (typeof value === 'string' && value.trim()) return value.trim()
  if (Array.isArray(value) && typeof value[0] === 'string' && value[0].trim()) {
    return value[0].trim()
  }
  return null
}

function slugFromRequest(req: VercelRequest): string | null {
  const fromQuery = firstQueryValue(req.query?.slug)
  if (fromQuery) return fromQuery.toLowerCase()
  const path = (req.url ?? '').split('?')[0] ?? ''
  const match = path.match(/\/api\/calendar\/([^/]+)\/?$/)
  if (!match?.[1]) return null
  try {
    return decodeURIComponent(match[1]).trim().toLowerCase()
  } catch {
    return match[1].trim().toLowerCase()
  }
}

function asText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  assertNoClientLeakedSecrets()
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' })
  }

  const slug = slugFromRequest(req)
  if (!slug) return res.status(400).json({ ok: false, error: 'Missing team slug' })

  let url: string
  let key: string
  try {
    ;({ url, key } = requirePublishableSupabaseEnv())
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err instanceof Error ? err.message : 'Supabase env not configured',
    })
  }

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  try {
    const { data, error } = await supabase.rpc('get_team_schedule', { p_slug: slug })
    if (error) throw error
    if (!data || typeof data !== 'object') {
      return res.status(404).json({ ok: false, error: 'Team not found' })
    }
    const feed = data as {
      teamName?: string
      teamSlug?: string
      ageGroup?: string | null
      events?: Array<Record<string, unknown>>
    }
    const events: TeamCalendarEvent[] = (feed.events ?? []).map((event) => ({
      id: String(event.id ?? ''),
      opponent: asText(event.opponent) ?? 'Opponent',
      status: asText(event.status) ?? 'scheduled',
      matchDate: asText(event.match_date),
      matchTime: asText(event.match_time),
      date: asText(event.date),
      locationType: asText(event.location_type),
      placeName: asText(event.place_name),
      placeDetails: asText(event.place_details),
      arrivalNote: asText(event.arrival_note),
      periodLength: asNumber(event.period_length),
      totalPeriods: asNumber(event.total_periods),
      halfLength: asNumber(event.half_length),
    }))
    const ics = buildTeamCalendarIcs({
      teamName: feed.teamName ?? 'Game Day',
      teamSlug: feed.teamSlug ?? slug,
      ageGroup: feed.ageGroup ?? null,
      events,
    })
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8')
    res.setHeader('Content-Disposition', `inline; filename="${slug}.ics"`)
    res.setHeader('Cache-Control', 'public, max-age=300')
    res.status(200)
    res.end(ics)
    return
  } catch (err) {
    await reportApiError('[api/calendar]', err)
    return res.status(500).json({
      ok: false,
      error: err instanceof Error ? err.message : 'Failed to build calendar',
    })
  }
}
