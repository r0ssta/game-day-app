import { cleanRecapPositionNote } from '@/lib/match-event-notes'
import { normalizeRecapPosition } from '@/lib/positions'
import { formatOpponentWithVenue } from '@/lib/match-location'
import { formatPlayerFullName } from '@/lib/player-names'
import {
  averagePlayerRatings,
  clampPlayerRating,
  formatPlayerRating,
  legacyImpactScoreToRating,
  type PlayerRating,
} from '@/lib/player-rating'
import {
  fetchMatchEvents,
  fetchMatchReviews,
  fetchMatchStatsByMatchId,
  rebuildMatchPlayers,
} from '@/lib/supabase-api'
import type { DbMatchEvent } from '@/types/database'
import type { MatchPlayer, RosterPlayer } from '@/types/match'

export type PlayerRecapStats = {
  playerId: string
  totalSeconds: number
  positions: string[]
  goals: number
  assists: number
  saves: number
  yellowCards: number
  redCards: number
}

export type PositionRecapReview = {
  position: string
  rating: PlayerRating | null
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
  saves: number
  yellowCards: number
  redCards: number
  overallReview: PositionRecapReview
  positionReviews: PositionRecapReview[]
  sidelineStatsSummary?: string | null
}

export type SavedPositionReview = {
  rating: PlayerRating | null
  notes: string
}

const LEGACY_REVIEW_POSITION = 'Overall'

export const OVERALL_REVIEW_POSITION = 'Overall'

export function playerOverallReviewKey(playerId: string): string {
  return playerPositionReviewKey(playerId, OVERALL_REVIEW_POSITION)
}

export function isOverallReviewPosition(position: string): boolean {
  return normalizeRecapPosition(position) === OVERALL_REVIEW_POSITION
}

export function playerPositionReviewKey(playerId: string, position: string): string {
  return `${playerId}::${normalizeRecapPosition(position)}`
}

type TimelineEvent = DbMatchEvent & { absTimestamp: number }

export function buildAbsoluteMatchTimeline(
  events: DbMatchEvent[],
  halfLengthSeconds: number,
): TimelineEvent[] {
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
  const cleaned = cleanRecapPositionNote(rawPosition) ?? rawPosition?.trim() ?? ''
  const position = normalizeRecapPosition(cleaned)
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

  for (const event of playerEvents) {
    switch (event.event_type) {
      case 'sub_in':
        if (event.event_notes?.trim()) {
          addRecapPosition(positions, event.event_notes)
        } else if (positions.length === 0 && fallbackPosition) {
          addRecapPosition(positions, fallbackPosition)
        }
        break
      case 'position_change':
        addRecapPosition(positions, event.event_notes)
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
  const timeline = buildAbsoluteMatchTimeline(events, halfLengthSeconds)
  const stats = new Map<
    string,
    {
      totalSeconds: number
      goals: number
      assists: number
      saves: number
      yellowCards: number
      redCards: number
    }
  >()

  const ensure = (playerId: string) => {
    if (!stats.has(playerId)) {
      stats.set(playerId, {
        totalSeconds: 0,
        goals: 0,
        assists: 0,
        saves: 0,
        yellowCards: 0,
        redCards: 0,
      })
    }
    return stats.get(playerId)!
  }

  const openStints = new Map<string, number>()

  for (const event of timeline) {
    if (
      event.event_type === 'opponent_goal' ||
      event.event_type === 'shot_home' ||
      event.event_type === 'shot_away' ||
      event.event_type === 'save_away' ||
      event.event_type === 'corner_home' ||
      event.event_type === 'corner_away'
    ) {
      continue
    }

    if (!event.player_id) {
      continue
    }

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
      case 'save_home':
        row.saves += 1
        break
      case 'yellow_card':
        row.yellowCards += 1
        break
      case 'red_card':
        row.redCards += 1
        break
    }
  }

  const playerIds = new Set<string>([...stats.keys(), ...(playersById ? playersById.keys() : [])])

  const result = new Map<string, PlayerRecapStats>()
  for (const playerId of playerIds) {
    const row = stats.get(playerId) ?? {
      totalSeconds: 0,
      goals: 0,
      assists: 0,
      saves: 0,
      yellowCards: 0,
      redCards: 0,
    }
    const fallbackPosition = playersById?.get(playerId)?.matchPosition
    result.set(playerId, {
      playerId,
      totalSeconds: row.totalSeconds,
      positions: computePlayerPositionsFromTimeline(playerId, timeline, fallbackPosition),
      goals: row.goals,
      assists: row.assists,
      saves: row.saves,
      yellowCards: row.yellowCards,
      redCards: row.redCards,
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

function formatRatingLabel(rating: PlayerRating | null): string {
  if (rating == null) return 'Unrated'
  return formatPlayerRating(rating, 0)
}

export function buildPositionReviews(
  playerId: string,
  positions: string[],
  savedReviews: Map<string, SavedPositionReview>,
  fallbackRating: PlayerRating | null = null,
): PositionRecapReview[] {
  return positions.map((position) => {
    const saved = savedReviews.get(playerPositionReviewKey(playerId, position))

    return {
      position: normalizeRecapPosition(position),
      rating: saved?.rating ?? fallbackRating,
      notes: saved?.notes ?? '',
    }
  })
}

export function buildRecapRows(
  players: MatchPlayer[],
  eventStats: Map<string, PlayerRecapStats>,
  savedReviews: Map<string, SavedPositionReview>,
): PlayerRecapReview[] {
  const participatingIds = new Set<string>()
  for (const player of players) {
    if (player.attending) participatingIds.add(player.id)
  }
  for (const playerId of eventStats.keys()) {
    const player = players.find((entry) => entry.id === playerId)
    if (player && player.attending === false) continue
    participatingIds.add(playerId)
  }

  return [...participatingIds]
    .map((playerId) => {
      const player = players.find((p) => p.id === playerId)
      if (!player || player.attending === false) return null

      const stats = eventStats.get(playerId)
      const positions = resolvePlayerPositions(stats, player)
      const overallSaved = savedReviews.get(playerOverallReviewKey(playerId))
      const positionReviews = buildPositionReviews(playerId, positions, savedReviews, null)

      return {
        playerId,
        name: formatPlayerFullName(player.firstName, player.lastName),
        number: player.number,
        totalSeconds: stats?.totalSeconds ?? player.totalSecondsPlayed,
        positions,
        goals: stats?.goals ?? 0,
        assists: stats?.assists ?? 0,
        saves: stats?.saves ?? 0,
        yellowCards: stats?.yellowCards ?? 0,
        redCards: stats?.redCards ?? 0,
        overallReview: {
          position: OVERALL_REVIEW_POSITION,
          rating: overallSaved?.rating ?? null,
          notes: overallSaved?.notes ?? '',
        },
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
  qualitativeContextLines?: string[]
  disciplineLines?: string[]
  teamShotSaveLine?: string | null
  rows: PlayerRecapReview[]
}): string {
  const coachSummary = input.coachSummary?.trim()
  const coachName = input.coachName?.trim()
  const venueLine = formatOpponentWithVenue(input.opponent, input.locationType ?? 'home')
  const qualitativeLines = input.qualitativeContextLines ?? []
  const disciplineLines = input.disciplineLines ?? []
  const teamShotSaveLine = input.teamShotSaveLine?.trim()
  const lines = [
    'POST-GAME RECAP',
    '===============',
    `${input.teamName} · ${venueLine}`,
    `Final Score: ${input.homeScore} – ${input.awayScore}`,
    ...(teamShotSaveLine ? [`Box Score: ${teamShotSaveLine}`] : []),
    ...(coachName ? [`Head Coach: ${coachName}`, ''] : ['']),
    ...(coachSummary
      ? ['COACH SUMMARY', '--------------', coachSummary, '']
      : []),
    ...(qualitativeLines.length > 0 ? [...qualitativeLines, ''] : []),
    ...(disciplineLines.length > 0
      ? ['DISCIPLINE / CARDS', '------------------', ...disciplineLines.map((l) => `• ${l}`), '']
      : []),
    'PLAYER STATS',
    '------------',
    ...input.rows.flatMap((row) => {
      const positions = row.positions.length > 0 ? row.positions.join(', ') : '—'
      const overallNotes = row.overallReview.notes.trim()
        ? ` · Notes: ${row.overallReview.notes.trim()}`
        : ''
      const ratingLines = [
        `  Overall: ${formatRatingLabel(row.overallReview.rating)}${overallNotes}`,
        ...(row.positionReviews.length > 1
          ? row.positionReviews.map((review) => {
              const notes = review.notes.trim() ? ` · Notes: ${review.notes.trim()}` : ''
              return `  ${review.position}: ${formatRatingLabel(review.rating)}${notes}`
            })
          : []),
      ]
      const cardBits = [
        row.yellowCards > 0 ? `YC:${row.yellowCards}` : null,
        row.redCards > 0 ? `RC:${row.redCards}` : null,
      ].filter(Boolean)
      const saveBit = row.saves > 0 ? ` SV:${row.saves}` : ''

      return [
        `${row.number !== null ? `#${row.number}` : '—'} ${row.name}`,
        `  ${formatRecapMinutes(row.totalSeconds)} · ${positions}`,
        `  G:${row.goals} A:${row.assists}${saveBit}${cardBits.length ? ` ${cardBits.join(' ')}` : ''}`,
        ...(row.sidelineStatsSummary ? [`  Sideline: ${row.sidelineStatsSummary}`] : []),
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
    rating?: number | null
    /** @deprecated Legacy column name before 1–5 migration */
    impact_score?: number | null
    review_notes: string | null
  }>,
): Map<string, SavedPositionReview> {
  const savedReviews = new Map<string, SavedPositionReview>()

  for (const review of existingReviews) {
    const raw =
      typeof review.rating === 'number'
        ? review.rating
        : typeof review.impact_score === 'number'
          ? legacyImpactScoreToRating(review.impact_score)
          : null
    const payload: SavedPositionReview = {
      rating: raw == null ? null : clampPlayerRating(raw),
      notes: review.review_notes ?? '',
    }
    const position = review.position?.trim() || LEGACY_REVIEW_POSITION

    if (isOverallReviewPosition(position)) {
      savedReviews.set(playerOverallReviewKey(review.player_id), payload)
      continue
    }

    savedReviews.set(playerPositionReviewKey(review.player_id, position), payload)
  }

  return savedReviews
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
  const savedReviews = indexSavedReviews(existingReviews)

  return buildRecapRows(players, eventStats, savedReviews)
}

export function averageMatchRating(ratings: number[]): number | null {
  return averagePlayerRatings(ratings)
}

export function formatAverageRatingLabel(average: number | null): string {
  return formatPlayerRating(average, 1)
}
