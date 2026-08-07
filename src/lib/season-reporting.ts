import { formatMatchDisplayDateTime } from '@/lib/match-schedule'
import { formatOpponentWithVenue, resolveMatchLocationType } from '@/lib/match-location'
import { formatPlayerFullName } from '@/lib/player-names'
import { displayMatchPosition } from '@/lib/positions'
import {
  aggregatePlayerRecaps,
  dominantImpact,
  formatAverageRatingLabel,
  formatRecapMinutes,
  resolvePlayerPositions,
} from '@/lib/match-recap'
import {
  fetchCompletedMatchesByTeamId,
  fetchMatchEvents,
  fetchMatchReviews,
  fetchMatchStatsByMatchId,
  rebuildMatchPlayers,
  scoreToImpact,
} from '@/lib/supabase-api'
import type { DbMatch } from '@/types/database'
import type { Impact, RosterPlayer } from '@/types/match'

export type SeasonRecord = {
  wins: number
  losses: number
  draws: number
  goalsFor: number
  goalsAgainst: number
  matchesPlayed: number
}

export type PlayerPositionRatingStats = {
  position: string
  matchCount: number
  ratingCounts: { positive: number; neutral: number; negative: number }
  averageRating: Impact
}

export type PlayerMatchLog = {
  matchId: string
  opponent: string
  venueLabel: string
  dateLabel: string
  minutes: number
  goals: number
  assists: number
  positionRatings: Array<{ position: string; impact: Impact; notes: string }>
  positions: string[]
}

export type PlayerSeasonStats = {
  playerId: string
  matchesPlayed: number
  totalMinutes: number
  averageMinutesPerMatch: number
  goals: number
  assists: number
  positionsPlayed: string[]
  primaryPositionPlayed: string
  secondaryPositionPlayed: string
  ratingCounts: { positive: number; neutral: number; negative: number }
  positionBreakdown: PlayerPositionRatingStats[]
  feedbackHistory: Array<{
    matchId: string
    opponent: string
    dateLabel: string
    position: string
    impact: Impact
    notes: string
  }>
  matchLogs: PlayerMatchLog[]
}

export type SeasonReportData = {
  matches: DbMatch[]
  seasonRecord: SeasonRecord
  playerStats: Map<string, PlayerSeasonStats>
}

export function emptySeasonReportData(): SeasonReportData {
  return {
    matches: [],
    seasonRecord: {
      wins: 0,
      losses: 0,
      draws: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      matchesPlayed: 0,
    },
    playerStats: new Map(),
  }
}

export function computeSeasonRecord(matches: DbMatch[]): SeasonRecord {
  let wins = 0
  let losses = 0
  let draws = 0
  let goalsFor = 0
  let goalsAgainst = 0

  for (const match of matches) {
    goalsFor += match.home_score
    goalsAgainst += match.away_score
    if (match.home_score > match.away_score) wins++
    else if (match.home_score < match.away_score) losses++
    else draws++
  }

  return {
    wins,
    losses,
    draws,
    goalsFor,
    goalsAgainst,
    matchesPlayed: matches.length,
  }
}

export function formatSeasonRecordSummary(record: SeasonRecord): string {
  const parts = [
    `Overall Record: ${record.wins} Wins - ${record.losses} Losses - ${record.draws} Draws`,
    `Goals For: ${record.goalsFor}`,
    `Goals Against: ${record.goalsAgainst}`,
  ]
  return parts.join(' | ')
}

export function emptyPlayerSeasonStats(playerId: string): PlayerSeasonStats {
  return {
    playerId,
    matchesPlayed: 0,
    totalMinutes: 0,
    averageMinutesPerMatch: 0,
    goals: 0,
    assists: 0,
    positionsPlayed: [],
    primaryPositionPlayed: '—',
    secondaryPositionPlayed: '—',
    ratingCounts: { positive: 0, neutral: 0, negative: 0 },
    positionBreakdown: [],
    feedbackHistory: [],
    matchLogs: [],
  }
}

function incrementPositionCount(counts: Map<string, number>, position: string) {
  const key = displayMatchPosition(position)
  if (!key || key === '—') return
  counts.set(key, (counts.get(key) ?? 0) + 1)
}

function topPositions(counts: Map<string, number>): [string, string] {
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1])
  return [sorted[0]?.[0] ?? '—', sorted[1]?.[0] ?? '—']
}

function ensurePositionBreakdown(
  map: Map<string, PlayerPositionRatingStats>,
  position: string,
): PlayerPositionRatingStats {
  const existing = map.get(position)
  if (existing) return existing

  const created: PlayerPositionRatingStats = {
    position,
    matchCount: 0,
    ratingCounts: { positive: 0, neutral: 0, negative: 0 },
    averageRating: 'neutral',
  }
  map.set(position, created)
  return created
}

export async function loadSeasonReport(
  teamId: string,
  roster: RosterPlayer[],
): Promise<SeasonReportData> {
  const matches = await fetchCompletedMatchesByTeamId(teamId)
  const seasonRecord = computeSeasonRecord(matches)
  const playerStats = new Map<string, PlayerSeasonStats>(
    roster.map((player) => [player.id, emptyPlayerSeasonStats(player.id)]),
  )
  const positionCounts = new Map<string, Map<string, number>>()
  const positionBreakdownMaps = new Map<string, Map<string, PlayerPositionRatingStats>>()
  const ratedMatchesByPosition = new Map<string, Map<string, Set<string>>>()

  for (const player of roster) {
    positionCounts.set(player.id, new Map())
    positionBreakdownMaps.set(player.id, new Map())
    ratedMatchesByPosition.set(player.id, new Map())
  }

  await Promise.all(
    matches.map(async (match) => {
      const { dateLabel } = formatMatchDisplayDateTime(match)
      const venueLabel = formatOpponentWithVenue(
        match.opponent,
        resolveMatchLocationType(match),
      )

      const [events, stats, reviews] = await Promise.all([
        fetchMatchEvents(match.id),
        fetchMatchStatsByMatchId(match.id),
        fetchMatchReviews(match.id).catch(() => []),
      ])

      const eventStats = aggregatePlayerRecaps(events, match.half_length * 60)
      const matchPlayers = rebuildMatchPlayers(roster, stats)
      const reviewsByPlayerPosition = new Map<string, Array<{ position: string; impact: Impact; notes: string }>>()

      for (const review of reviews) {
        const position = review.position?.trim() || 'Overall'
        const payload = {
          position,
          impact: scoreToImpact(review.impact_score),
          notes: review.review_notes ?? '',
        }
        const bucket = reviewsByPlayerPosition.get(review.player_id) ?? []
        bucket.push(payload)
        reviewsByPlayerPosition.set(review.player_id, bucket)
      }

      for (const stat of stats) {
        if (!stat.attending) continue

        const entry = playerStats.get(stat.player_id)
        if (!entry) continue

        const player = matchPlayers.find((p) => p.id === stat.player_id)
        const recap = eventStats.get(stat.player_id)
        const minutes = recap?.totalSeconds ?? stat.total_seconds_played ?? 0
        const goals = recap?.goals ?? 0
        const assists = recap?.assists ?? 0
        const positions =
          player && recap
            ? resolvePlayerPositions(recap, player)
            : recap && recap.positions.length > 0
              ? recap.positions
              : [displayMatchPosition(stat.match_position)]

        const savedReviews = reviewsByPlayerPosition.get(stat.player_id) ?? []
        const positionRatings =
          savedReviews.length > 0
            ? savedReviews
            : [
                {
                  position: positions[0] ?? 'Overall',
                  impact: scoreToImpact(stat.impact_score),
                  notes: '',
                },
              ]

        entry.matchesPlayed += 1
        entry.totalMinutes += minutes
        entry.goals += goals
        entry.assists += assists

        const posMap = positionCounts.get(stat.player_id)!
        for (const position of positions) {
          incrementPositionCount(posMap, position)
        }

        const breakdownMap = positionBreakdownMaps.get(stat.player_id)!
        const ratedMatches = ratedMatchesByPosition.get(stat.player_id)!

        for (const rating of positionRatings) {
          entry.ratingCounts[rating.impact] += 1

          const breakdown = ensurePositionBreakdown(breakdownMap, rating.position)
          breakdown.ratingCounts[rating.impact] += 1

          const seenMatches = ratedMatches.get(rating.position) ?? new Set<string>()
          if (!seenMatches.has(match.id)) {
            seenMatches.add(match.id)
            ratedMatches.set(rating.position, seenMatches)
            breakdown.matchCount += 1
          }

          if (rating.notes.trim()) {
            entry.feedbackHistory.push({
              matchId: match.id,
              opponent: match.opponent.trim() || 'Opponent',
              dateLabel,
              position: rating.position,
              impact: rating.impact,
              notes: rating.notes.trim(),
            })
          }
        }

        entry.matchLogs.push({
          matchId: match.id,
          opponent: match.opponent.trim() || 'Opponent',
          venueLabel,
          dateLabel,
          minutes,
          goals,
          assists,
          positionRatings,
          positions,
        })
      }
    }),
  )

  for (const entry of playerStats.values()) {
    entry.averageMinutesPerMatch =
      entry.matchesPlayed > 0 ? Math.round(entry.totalMinutes / entry.matchesPlayed) : 0

    const posMap = positionCounts.get(entry.playerId) ?? new Map()
    const [primary, secondary] = topPositions(posMap)
    entry.primaryPositionPlayed = primary
    entry.secondaryPositionPlayed = secondary
    entry.positionsPlayed = [...posMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([name]) => name)

    const breakdownMap = positionBreakdownMaps.get(entry.playerId) ?? new Map()
    entry.positionBreakdown = [...breakdownMap.values()]
      .map((item) => ({
        ...item,
        averageRating: dominantImpact(item.ratingCounts),
      }))
      .sort((a, b) => b.matchCount - a.matchCount || a.position.localeCompare(b.position))
  }

  return { matches, seasonRecord, playerStats }
}

export function getPlayerFromRoster(roster: RosterPlayer[], playerId: string) {
  return roster.find((player) => player.id === playerId) ?? null
}

export function formatPlayerSeasonHeader(player: RosterPlayer, stats: PlayerSeasonStats) {
  return {
    name: formatPlayerFullName(player.firstName, player.lastName),
    jersey: player.number,
    rosterPrimary: player.primaryPosition,
    rosterSecondary: player.secondaryPosition,
    avgMinutesLabel: formatRecapMinutes(stats.averageMinutesPerMatch),
    totalMinutesLabel: formatRecapMinutes(stats.totalMinutes),
  }
}

export function formatPositionBreakdownLine(stats: PlayerPositionRatingStats): string {
  const matchLabel = stats.matchCount === 1 ? 'match' : 'matches'
  return `${stats.matchCount} ${matchLabel} as ${stats.position} (Avg Rating: ${formatAverageRatingLabel(stats.averageRating)})`
}
