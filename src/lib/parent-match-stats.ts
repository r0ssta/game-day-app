import { formatPlayerFullName } from '@/lib/player-names'
import { aggregatePlayerRecaps, formatRecapMinutes } from '@/lib/match-recap'
import type { ParentHubPlayer, ParentLiveEvent } from '@/lib/parent-hub'
import type { DbMatchEvent } from '@/types/database'

export type ParentMatchPlayerStat = {
  playerId: string
  name: string
  jersey: number | null
  totalSeconds: number
  minutesLabel: string
  positions: string[]
  positionsLabel: string
  goals: number
  assists: number
  saves: number
  yellowCards: number
  redCards: number
}

function parentLiveEventsToDbMatchEvents(
  events: ParentLiveEvent[],
  matchId: string,
): DbMatchEvent[] {
  return events.map((event) => ({
    id: event.id,
    match_id: matchId,
    player_id: event.playerId,
    event_type: event.eventType as DbMatchEvent['event_type'],
    timestamp: event.timestamp,
    event_notes: event.eventNotes,
    formation: null,
    assist_player_id: event.assistPlayerId,
    is_pk: event.isPk ?? false,
    pk_result: null,
    pk_team: null,
    created_at: event.createdAt,
  }))
}

/** Parent-safe per-player box score from public match events (no ratings or coach notes). */
export function buildParentMatchPlayerStats(
  events: ParentLiveEvent[],
  matchId: string,
  halfLengthMinutes: number,
  players: ParentHubPlayer[],
): ParentMatchPlayerStat[] {
  const playersById = new Map(players.map((player) => [player.id, player] as const))
  const dbEvents = parentLiveEventsToDbMatchEvents(events, matchId)
  const eventStats = aggregatePlayerRecaps(
    dbEvents,
    Math.max(1, halfLengthMinutes) * 60,
    new Map(players.map((player) => [player.id, { matchPosition: '—' }])),
  )

  const lines: ParentMatchPlayerStat[] = []

  for (const [playerId, stats] of eventStats) {
    const hasActivity =
      stats.totalSeconds > 0 ||
      stats.goals > 0 ||
      stats.assists > 0 ||
      stats.saves > 0 ||
      stats.yellowCards > 0 ||
      stats.redCards > 0
    if (!hasActivity) continue

    const player = playersById.get(playerId)
    const name = player ? formatPlayerFullName(player.firstName, player.lastName) : 'Player'
    const positions = stats.positions.filter((position) => position && position !== '—')
    const positionsLabel = positions.length > 0 ? positions.join(', ') : '—'

    lines.push({
      playerId,
      name,
      jersey: player?.number ?? null,
      totalSeconds: stats.totalSeconds,
      minutesLabel: formatRecapMinutes(stats.totalSeconds),
      positions,
      positionsLabel,
      goals: stats.goals,
      assists: stats.assists,
      saves: stats.saves,
      yellowCards: stats.yellowCards,
      redCards: stats.redCards,
    })
  }

  return lines.sort((a, b) => {
    const jerseyA = a.jersey ?? 999
    const jerseyB = b.jersey ?? 999
    if (jerseyA !== jerseyB) return jerseyA - jerseyB
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
  })
}
