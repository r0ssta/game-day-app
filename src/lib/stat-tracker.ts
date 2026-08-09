import { formatPlayerFullName } from '@/lib/player-names'
import type { DbMatchEvent } from '@/types/database'

export const STAT_TRACKER_EVENT_TYPES = [
  'stat_shot_on_target',
  'stat_shot_off_target',
  'stat_goal',
  'stat_assist',
  'stat_dribble',
  'stat_tackle',
  'stat_save',
  'stat_pass',
  'stat_key_pass',
] as const

export type StatTrackerEventType = (typeof STAT_TRACKER_EVENT_TYPES)[number]

export type StatTrackerAction = {
  eventType: StatTrackerEventType
  label: string
  shortLabel: string
  icon: string
  tone: 'neon' | 'athletic' | 'muted' | 'danger'
}

export const STAT_TRACKER_ACTIONS: StatTrackerAction[] = [
  { eventType: 'stat_goal', label: 'Goal Scored', shortLabel: 'Goal', icon: '⚽', tone: 'neon' },
  { eventType: 'stat_shot_on_target', label: 'Shot On Target', shortLabel: 'SOT', icon: '🎯', tone: 'neon' },
  { eventType: 'stat_shot_off_target', label: 'Shot Off Target', shortLabel: 'SOFF', icon: '🎯', tone: 'muted' },
  { eventType: 'stat_assist', label: 'Assist', shortLabel: 'Ast', icon: '🅰️', tone: 'athletic' },
  { eventType: 'stat_tackle', label: 'Tackle / Defensive Win', shortLabel: 'Tkl', icon: '🛡️', tone: 'athletic' },
  { eventType: 'stat_pass', label: 'Completed Pass', shortLabel: 'Pass', icon: '👟', tone: 'muted' },
  { eventType: 'stat_save', label: 'Goalkeeper Save', shortLabel: 'Save', icon: '🧤', tone: 'neon' },
  { eventType: 'stat_dribble', label: 'Successful Dribble', shortLabel: 'Drib', icon: '⚡', tone: 'athletic' },
  { eventType: 'stat_key_pass', label: 'Key Pass', shortLabel: 'Key', icon: '🔑', tone: 'neon' },
]

export type PlayerMicroStats = {
  shotsOnTarget: number
  shotsOffTarget: number
  statGoals: number
  statAssists: number
  dribbles: number
  tackles: number
  saves: number
  passes: number
  keyPasses: number
}

export type StatTrackerRosterPlayer = {
  id: string
  name: string
  number: number | null
}

export type StatTrackerEventFeedItem = {
  id: string
  playerId: string | null
  playerName: string
  jersey: number | null
  eventType: StatTrackerEventType
  label: string
  minuteLabel: string
  createdAt: string
}

export function formatStatTrackerMinute(seconds: number): string {
  const minutes = Math.floor(seconds / 60)
  return `${minutes}'`
}

export function resolveStatTrackerEventLabel(event: DbMatchEvent): string | null {
  if (isStatTrackerEventType(event.event_type)) {
    return statTrackerActionLabel(event.event_type)
  }
  if (event.event_type === 'stat_team_log' && event.event_notes && isStatTrackerEventType(event.event_notes)) {
    return statTrackerActionLabel(event.event_notes)
  }
  return null
}

export function isStatTrackerFeedEvent(event: DbMatchEvent): boolean {
  return resolveStatTrackerEventLabel(event) !== null
}

export function emptyPlayerMicroStats(): PlayerMicroStats {
  return {
    shotsOnTarget: 0,
    shotsOffTarget: 0,
    statGoals: 0,
    statAssists: 0,
    dribbles: 0,
    tackles: 0,
    saves: 0,
    passes: 0,
    keyPasses: 0,
  }
}

export function isStatTrackerEventType(value: string): value is StatTrackerEventType {
  return (STAT_TRACKER_EVENT_TYPES as readonly string[]).includes(value)
}

export function statTrackerActionLabel(eventType: StatTrackerEventType): string {
  return STAT_TRACKER_ACTIONS.find((action) => action.eventType === eventType)?.label ?? eventType
}

export function aggregateMicroStats(events: DbMatchEvent[]): Map<string, PlayerMicroStats> {
  const stats = new Map<string, PlayerMicroStats>()

  const ensure = (playerId: string) => {
    if (!stats.has(playerId)) stats.set(playerId, emptyPlayerMicroStats())
    return stats.get(playerId)!
  }

  for (const event of events) {
    if (!event.player_id || !isStatTrackerEventType(event.event_type)) continue
    const row = ensure(event.player_id)

    switch (event.event_type) {
      case 'stat_shot_on_target':
        row.shotsOnTarget += 1
        break
      case 'stat_shot_off_target':
        row.shotsOffTarget += 1
        break
      case 'stat_goal':
        row.statGoals += 1
        break
      case 'stat_assist':
        row.statAssists += 1
        break
      case 'stat_dribble':
        row.dribbles += 1
        break
      case 'stat_tackle':
        row.tackles += 1
        break
      case 'stat_save':
        row.saves += 1
        break
      case 'stat_pass':
        row.passes += 1
        break
      case 'stat_key_pass':
        row.keyPasses += 1
        break
    }
  }

  return stats
}

export function buildStatTrackerFeed(
  events: DbMatchEvent[],
  rosterById: Map<string, StatTrackerRosterPlayer>,
): StatTrackerEventFeedItem[] {
  return events
    .filter((event) => isStatTrackerFeedEvent(event))
    .map((event) => {
      const label = resolveStatTrackerEventLabel(event)!
      const isTeamLog = event.event_type === 'stat_team_log'
      const eventType = (isTeamLog ? event.event_notes : event.event_type) as StatTrackerEventType
      const player = event.player_id ? rosterById.get(event.player_id) : null

      return {
        id: event.id,
        playerId: event.player_id,
        playerName: isTeamLog ? 'Team' : (player?.name ?? 'Player'),
        jersey: isTeamLog ? null : (player?.number ?? null),
        eventType,
        label,
        minuteLabel: formatStatTrackerMinute(event.timestamp),
        createdAt: event.created_at,
      }
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export function formatStatTrackerFeedLine(entry: Pick<StatTrackerEventFeedItem, 'label' | 'playerName' | 'jersey' | 'minuteLabel'>): string {
  const playerLabel =
    entry.jersey !== null ? `#${entry.jersey} ${entry.playerName}` : entry.playerName
  return `${entry.label} · ${playerLabel} (${entry.minuteLabel})`
}

export function formatMicroStatsSummary(stats: PlayerMicroStats): string | null {
  const parts: string[] = []
  if (stats.shotsOnTarget > 0) parts.push(`${stats.shotsOnTarget} SOT`)
  if (stats.shotsOffTarget > 0) parts.push(`${stats.shotsOffTarget} SOFF`)
  if (stats.statGoals > 0) parts.push(`${stats.statGoals} tracker G`)
  if (stats.statAssists > 0) parts.push(`${stats.statAssists} tracker A`)
  if (stats.dribbles > 0) parts.push(`${stats.dribbles} dribbles`)
  if (stats.tackles > 0) parts.push(`${stats.tackles} tackles`)
  if (stats.saves > 0) parts.push(`${stats.saves} saves`)
  if (stats.passes > 0) parts.push(`${stats.passes} passes`)
  if (stats.keyPasses > 0) parts.push(`${stats.keyPasses} key passes`)
  return parts.length > 0 ? parts.join(' · ') : null
}

export function hasMicroStats(stats: PlayerMicroStats): boolean {
  return formatMicroStatsSummary(stats) !== null
}

export function normalizeStatTrackerToken(raw: string | null | undefined): string | null {
  if (!raw) return null
  const cleaned = raw.trim().replace(/\s+/g, '').toLowerCase()
  return cleaned || null
}

export function parseStatTrackerRoute(): { matchId: string; token: string } | null {
  const normalizeToken = normalizeStatTrackerToken

  // Primary: ?statTracker=1&matchId=...&token=... (most reliable on static hosts)
  const pageParams = new URLSearchParams(window.location.search)
  if (pageParams.get('statTracker') === '1') {
    const matchId = pageParams.get('matchId')?.trim()
    const token = normalizeToken(pageParams.get('token'))
    if (matchId && token) return { matchId, token }
  }

  const fromSearch = (search: string, pathname: string) => {
    const pathMatch = pathname.match(/\/match\/([^/?#]+)\/tracker\/?$/i)
    const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
    const token = normalizeToken(params.get('token'))
    if (pathMatch?.[1] && token) {
      return { matchId: pathMatch[1], token }
    }
    return null
  }

  const direct = fromSearch(window.location.search, window.location.pathname)
  if (direct) return direct

  const hash = window.location.hash.startsWith('#')
    ? window.location.hash.slice(1)
    : window.location.hash
  if (hash) {
    const queryIndex = hash.indexOf('?')
    const hashPath = queryIndex >= 0 ? hash.slice(0, queryIndex) : hash
    const hashSearch = queryIndex >= 0 ? hash.slice(queryIndex + 1) : ''
    const fromHash = fromSearch(hashSearch, hashPath.startsWith('/') ? hashPath : `/${hashPath}`)
    if (fromHash) return fromHash
  }

  const altMatchId = pageParams.get('matchId')?.trim()
  const altToken = normalizeToken(pageParams.get('token'))
  if (altMatchId && altToken) {
    return { matchId: altMatchId, token: altToken }
  }

  return null
}

export function buildStatTrackerUrl(matchId: string, token: string): string {
  const base = `${window.location.origin}${window.location.pathname.replace(/\/$/, '') || ''}`
  const params = new URLSearchParams({
    statTracker: '1',
    matchId,
    token,
  })
  return `${base}?${params.toString()}`
}

export function generateStatTrackerToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24))
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export function rosterPlayerFromDb(
  player: { id: string; first_name: string; last_name: string; jersey: number | null },
): StatTrackerRosterPlayer {
  return {
    id: player.id,
    name: formatPlayerFullName(player.first_name, player.last_name),
    number: player.jersey,
  }
}
