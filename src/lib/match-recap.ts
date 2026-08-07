import { displayMatchPosition } from '@/lib/positions'
import { formatOpponentWithVenue } from '@/lib/match-location'
import { formatPlayerFullName } from '@/lib/player-names'
import {
  fetchMatchEvents,
  fetchMatchReviews,
  fetchMatchStatsByMatchId,
  rebuildMatchPlayers,
  scoreToImpact,
} from '@/lib/supabase-api'
import type { DbMatchEvent } from '@/types/database'
import type { Impact, MatchPlayer, RosterPlayer } from '@/types/match'

export type PlayerRecapStats = {
  playerId: string
  totalSeconds: number
  positions: string[]
  goals: number
  assists: number
}

type TimelineEvent = DbMatchEvent & { absTimestamp: number }

function toAbsoluteTimeline(events: DbMatchEvent[], halfLengthSeconds: number): TimelineEvent[] {
  const sorted = [...events].sort(
    (a, b) => a.created_at.localeCompare(b.created_at) || a.timestamp - b.timestamp,
  )

  let periodOffset = 0
  let lastTimestamp = 0

  return sorted.map((event) => {
    if (event.timestamp < lastTimestamp - 30) {
      periodOffset += halfLengthSeconds
    }
    lastTimestamp = event.timestamp
    return { ...event, absTimestamp: periodOffset + event.timestamp }
  })
}

export function aggregatePlayerRecaps(
  events: DbMatchEvent[],
  halfLengthSeconds: number,
): Map<string, PlayerRecapStats> {
  const timeline = toAbsoluteTimeline(events, halfLengthSeconds)
  const stats = new Map<
    string,
    { totalSeconds: number; positions: Set<string>; goals: number; assists: number }
  >()

  const ensure = (playerId: string) => {
    if (!stats.has(playerId)) {
      stats.set(playerId, { totalSeconds: 0, positions: new Set(), goals: 0, assists: 0 })
    }
    return stats.get(playerId)!
  }

  const openStints = new Map<string, number>()

  for (const event of timeline) {
    if (event.event_type === 'opponent_goal' || !event.player_id) continue

    const row = ensure(event.player_id)

    switch (event.event_type) {
      case 'sub_in':
        openStints.set(event.player_id, event.absTimestamp)
        break
      case 'sub_out': {
        const start = openStints.get(event.player_id)
        if (start !== undefined) {
          row.totalSeconds += Math.max(0, event.absTimestamp - start)
          openStints.delete(event.player_id)
        }
        break
      }
      case 'position_change':
        if (event.event_notes?.trim()) {
          row.positions.add(displayMatchPosition(event.event_notes.trim()))
        }
        break
      case 'goal':
        row.goals += 1
        if (event.assist_player_id) {
          ensure(event.assist_player_id).assists += 1
        }
        break
      case 'assist':
        row.assists += 1
        break
    }
  }

  const result = new Map<string, PlayerRecapStats>()
  for (const [playerId, row] of stats) {
    result.set(playerId, {
      playerId,
      totalSeconds: row.totalSeconds,
      positions: [...row.positions],
      goals: row.goals,
      assists: row.assists,
    })
  }
  return result
}

export function formatRecapMinutes(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  if (seconds === 0) return `${minutes}m`
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

export type PlayerRecapReview = {
  playerId: string
  name: string
  number: number | null
  totalSeconds: number
  positions: string[]
  goals: number
  assists: number
  impact: Impact
  notes: string
}

export function buildRecapRows(
  players: MatchPlayer[],
  eventStats: Map<string, PlayerRecapStats>,
  reviews: Map<string, { impact: Impact; notes: string }>,
): PlayerRecapReview[] {
  const participatingIds = new Set<string>()
  for (const player of players) {
    if (player.attending) participatingIds.add(player.id)
  }
  for (const playerId of eventStats.keys()) {
    participatingIds.add(playerId)
  }

  return [...participatingIds]
    .map((playerId) => {
      const player = players.find((p) => p.id === playerId)
      if (!player) return null

      const stats = eventStats.get(playerId)
      const review = reviews.get(playerId)

      return {
        playerId,
        name: formatPlayerFullName(player.firstName, player.lastName),
        number: player.number,
        totalSeconds: stats?.totalSeconds ?? player.totalSecondsPlayed,
        positions: stats?.positions ?? [displayMatchPosition(player.matchPosition)],
        goals: stats?.goals ?? 0,
        assists: stats?.assists ?? 0,
        impact: review?.impact ?? player.impact,
        notes: review?.notes ?? '',
      }
    })
    .filter((row): row is PlayerRecapReview => row !== null)
    .sort((a, b) => (a.number ?? 999) - (b.number ?? 999))
}

export function buildRecapSummaryText(input: {
  teamName: string
  opponent: string
  locationType?: 'home' | 'away'
  homeScore: number
  awayScore: number
  coachName?: string
  coachSummary?: string
  rows: PlayerRecapReview[]
}): string {
  const coachSummary = input.coachSummary?.trim()
  const coachName = input.coachName?.trim()
  const venueLine = formatOpponentWithVenue(input.opponent, input.locationType ?? 'home')
  const lines = [
    'POST-GAME RECAP',
    '===============',
    `${input.teamName} · ${venueLine}`,
    `Final Score: ${input.homeScore} – ${input.awayScore}`,
    ...(coachName ? [`Head Coach: ${coachName}`, ''] : []),
    ...(coachSummary
      ? ['COACH SUMMARY', '--------------', coachSummary, '', 'PLAYER STATS', '------------']
      : ['PLAYER STATS', '------------']),
    ...input.rows.map((row) => {
      const positions = row.positions.length > 0 ? row.positions.join(', ') : '—'
      const impact =
        row.impact === 'positive' ? '+' : row.impact === 'negative' ? '−' : '='
      const notes = row.notes.trim() ? ` · Notes: ${row.notes.trim()}` : ''
      return [
        `${row.number !== null ? `#${row.number}` : '—'} ${row.name}`,
        `  ${formatRecapMinutes(row.totalSeconds)} · ${positions}`,
        `  G:${row.goals} A:${row.assists} · Rating: ${impact}${notes}`,
      ].join('\n')
    }),
  ]
  return lines.join('\n')
}

export async function loadHistoricalRecapRows(
  matchId: string,
  halfLengthMinutes: number,
  roster: RosterPlayer[],
): Promise<PlayerRecapReview[]> {
  const [events, stats, existingReviews] = await Promise.all([
    fetchMatchEvents(matchId),
    fetchMatchStatsByMatchId(matchId),
    fetchMatchReviews(matchId).catch(() => []),
  ])

  const players = rebuildMatchPlayers(roster, stats)
  const eventStats = aggregatePlayerRecaps(events, halfLengthMinutes * 60)
  const reviewsMap = new Map<string, { impact: Impact; notes: string }>()

  for (const review of existingReviews) {
    reviewsMap.set(review.player_id, {
      impact: scoreToImpact(review.impact_score),
      notes: review.review_notes ?? '',
    })
  }

  return buildRecapRows(players, eventStats, reviewsMap)
}
