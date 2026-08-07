import { normalizeRecapPosition } from '@/lib/positions'
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

export type PositionRecapReview = {
  position: string
  impact: Impact
  notes: string
}

export type PlayerRecapReview = {
  playerId: string
  name: string
  number: number | null
  totalSeconds: number
  positions: string[]
  goals: number
  assists: number
  positionReviews: PositionRecapReview[]
}

export type SavedPositionReview = {
  impact: Impact
  notes: string
}

const LEGACY_REVIEW_POSITION = 'Overall'

export function playerPositionReviewKey(playerId: string, position: string): string {
  return `${playerId}::${normalizeRecapPosition(position)}`
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

function addRecapPosition(positions: string[], rawPosition: string | null | undefined) {
  const position = normalizeRecapPosition(rawPosition?.trim() ?? '')
  if (!position || position === '—') return
  if (!positions.includes(position)) positions.push(position)
}

/** Reconstruct every unique position a player held, in order of first appearance. */
export function computePlayerPositionsFromTimeline(
  playerId: string,
  timeline: TimelineEvent[],
  fallbackPosition?: string,
): string[] {
  const playerEvents = timeline.filter(
    (event) => event.player_id === playerId && event.event_type !== 'opponent_goal',
  )
  const positions: string[] = []
  let onField = false

  for (const event of playerEvents) {
    switch (event.event_type) {
      case 'sub_in':
        onField = true
        if (event.event_notes?.trim()) {
          addRecapPosition(positions, event.event_notes)
        }
        break
      case 'sub_out':
        onField = false
        break
      case 'position_change':
        if (onField) {
          addRecapPosition(positions, event.event_notes)
        }
        break
    }
  }

  if (positions.length === 0) {
    const fallback = normalizeRecapPosition(fallbackPosition ?? '')
    return fallback !== '—' ? [fallback] : ['—']
  }

  const finalPosition = normalizeRecapPosition(fallbackPosition ?? '')
  if (finalPosition !== '—' && !positions.includes(finalPosition)) {
    positions.push(finalPosition)
  }

  return positions
}

export function aggregatePlayerRecaps(
  events: DbMatchEvent[],
  halfLengthSeconds: number,
  playersById?: Map<string, Pick<MatchPlayer, 'matchPosition'>>,
): Map<string, PlayerRecapStats> {
  const timeline = toAbsoluteTimeline(events, halfLengthSeconds)
  const stats = new Map<
    string,
    {
      totalSeconds: number
      goals: number
      assists: number
    }
  >()

  const ensure = (playerId: string) => {
    if (!stats.has(playerId)) {
      stats.set(playerId, { totalSeconds: 0, goals: 0, assists: 0 })
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

  const playerIds = new Set<string>([...stats.keys(), ...(playersById ? playersById.keys() : [])])

  const result = new Map<string, PlayerRecapStats>()
  for (const playerId of playerIds) {
    const row = stats.get(playerId) ?? { totalSeconds: 0, goals: 0, assists: 0 }
    const fallbackPosition = playersById?.get(playerId)?.matchPosition
    result.set(playerId, {
      playerId,
      totalSeconds: row.totalSeconds,
      positions: computePlayerPositionsFromTimeline(playerId, timeline, fallbackPosition),
      goals: row.goals,
      assists: row.assists,
    })
  }
  return result
}

export function resolvePlayerPositions(
  eventStats: PlayerRecapStats | undefined,
  player: Pick<MatchPlayer, 'matchPosition'>,
): string[] {
  if (eventStats && eventStats.positions.length > 0) {
    return eventStats.positions
  }

  const finalPosition = normalizeRecapPosition(player.matchPosition)
  return finalPosition !== '—' ? [finalPosition] : ['—']
}

export function formatRecapMinutes(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  if (seconds === 0) return `${minutes}m`
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

function formatImpactSymbol(impact: Impact): string {
  if (impact === 'positive') return '+'
  if (impact === 'negative') return '−'
  return '='
}

export function buildPositionReviews(
  playerId: string,
  positions: string[],
  savedReviews: Map<string, SavedPositionReview>,
  legacyReview: SavedPositionReview | undefined,
  fallbackImpact: Impact,
): PositionRecapReview[] {
  return positions.map((position, index) => {
    const saved =
      savedReviews.get(playerPositionReviewKey(playerId, position)) ??
      (legacyReview && (positions.length === 1 || index === 0) ? legacyReview : undefined)

    return {
      position: normalizeRecapPosition(position),
      impact: saved?.impact ?? fallbackImpact,
      notes: saved?.notes ?? '',
    }
  })
}

export function buildRecapRows(
  players: MatchPlayer[],
  eventStats: Map<string, PlayerRecapStats>,
  savedReviews: Map<string, SavedPositionReview>,
  legacyReviews: Map<string, SavedPositionReview>,
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
      const positions = resolvePlayerPositions(stats, player)
      const positionReviews = buildPositionReviews(
        playerId,
        positions,
        savedReviews,
        legacyReviews.get(playerId),
        player.impact,
      )

      return {
        playerId,
        name: formatPlayerFullName(player.firstName, player.lastName),
        number: player.number,
        totalSeconds: stats?.totalSeconds ?? player.totalSecondsPlayed,
        positions,
        goals: stats?.goals ?? 0,
        assists: stats?.assists ?? 0,
        positionReviews,
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
    ...input.rows.flatMap((row) => {
      const positions = row.positions.length > 0 ? row.positions.join(', ') : '—'
      const ratingLines = row.positionReviews.map((review) => {
        const notes = review.notes.trim() ? ` · Notes: ${review.notes.trim()}` : ''
        const label =
          row.positionReviews.length > 1
            ? `${row.name} - ${review.position}`
            : `${row.name} (${review.position})`
        return `  ${label}: ${formatImpactSymbol(review.impact)}${notes}`
      })

      return [
        `${row.number !== null ? `#${row.number}` : '—'} ${row.name}`,
        `  ${formatRecapMinutes(row.totalSeconds)} · ${positions}`,
        `  G:${row.goals} A:${row.assists}`,
        ...ratingLines,
      ].join('\n')
    }),
  ]
  return lines.join('\n')
}

export function indexSavedReviews(
  existingReviews: Array<{
    player_id: string
    position?: string | null
    impact_score: number
    review_notes: string | null
  }>,
): {
  savedReviews: Map<string, SavedPositionReview>
  legacyReviews: Map<string, SavedPositionReview>
} {
  const savedReviews = new Map<string, SavedPositionReview>()
  const legacyReviews = new Map<string, SavedPositionReview>()

  for (const review of existingReviews) {
    const payload: SavedPositionReview = {
      impact: scoreToImpact(review.impact_score),
      notes: review.review_notes ?? '',
    }
    const position = review.position?.trim() || LEGACY_REVIEW_POSITION

    if (position === LEGACY_REVIEW_POSITION) {
      legacyReviews.set(review.player_id, payload)
      continue
    }

    savedReviews.set(playerPositionReviewKey(review.player_id, position), payload)
  }

  return { savedReviews, legacyReviews }
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
  const playersById = new Map(players.map((player) => [player.id, player]))
  const eventStats = aggregatePlayerRecaps(events, halfLengthMinutes * 60, playersById)
  const { savedReviews, legacyReviews } = indexSavedReviews(existingReviews)

  return buildRecapRows(players, eventStats, savedReviews, legacyReviews)
}

export function dominantImpact(counts: {
  positive: number
  neutral: number
  negative: number
}): Impact {
  if (counts.positive >= counts.neutral && counts.positive >= counts.negative) {
    return 'positive'
  }
  if (counts.negative >= counts.neutral && counts.negative >= counts.positive) {
    return 'negative'
  }
  return 'neutral'
}

export function formatAverageRatingLabel(impact: Impact): string {
  return formatImpactSymbol(impact)
}
