import { formatMatchDisplayDateTime } from '@/lib/match-schedule'
import { formatOpponentWithVenue, resolveMatchLocationType } from '@/lib/match-location'
import { formatPlayerFullName } from '@/lib/player-names'
import { displayMatchPosition } from '@/lib/positions'
import {
  aggregatePlayerRecaps,
  dominantImpact,
  formatAverageRatingLabel,
  formatRecapMinutes,
  isOverallReviewPosition,
  OVERALL_REVIEW_POSITION,
  resolvePlayerPositions,
} from '@/lib/match-recap'
import { computeMatchPlusMinus } from '@/lib/plus-minus'
import {
  computeLineupCombinationAnalytics,
  mergeLineupCombinationAnalytics,
  type LineupCombinationAnalytics,
} from '@/lib/lineup-analytics'
import {
  fetchCompletedMatchesByTeamId,
  fetchMatchEvents,
  fetchMatchReviews,
  fetchMatchStatsByMatchId,
  rebuildMatchPlayers,
  scoreToImpact,
} from '@/lib/supabase-api'
import { matchResultBucket } from '@/lib/penalty-kicks'
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
  positivePercent: number
}

export type PlayerMatchLog = {
  matchId: string
  opponent: string
  venueLabel: string
  dateLabel: string
  minutes: number
  goals: number
  assists: number
  yellowCards: number
  redCards: number
  plusMinus: number
  overallRating: { impact: Impact; notes: string }
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
  yellowCards: number
  redCards: number
  plusMinus: number
  positionsPlayed: string[]
  primaryPositionPlayed: string
  secondaryPositionPlayed: string
  ratingCounts: { positive: number; neutral: number; negative: number }
  averageOverallRating: Impact
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
  lineupAnalytics: LineupCombinationAnalytics
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
    lineupAnalytics: { topPairs: [], topFormations: [], positionEfficiency: [] },
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
    const result = matchResultBucket(match)
    if (result === 'win') wins++
    else if (result === 'loss') losses++
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
    yellowCards: 0,
    redCards: 0,
    plusMinus: 0,
    positionsPlayed: [],
    primaryPositionPlayed: '—',
    secondaryPositionPlayed: '—',
    ratingCounts: { positive: 0, neutral: 0, negative: 0 },
    averageOverallRating: 'neutral',
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

function positiveRatingPercent(counts: {
  positive: number
  neutral: number
  negative: number
}): number {
  const total = counts.positive + counts.neutral + counts.negative
  return total > 0 ? Math.round((counts.positive / total) * 100) : 0
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
    positivePercent: 0,
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

  const lineupChunks: LineupCombinationAnalytics[] = []

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

      const matchPlayers = rebuildMatchPlayers(roster, stats)
      const playersById = new Map(matchPlayers.map((player) => [player.id, player]))
      const eventStats = aggregatePlayerRecaps(events, match.half_length * 60, playersById)
      const firstHalfStarterIds = stats
        .filter((row) => row.is_first_half_starter)
        .map((row) => row.player_id)
      const plusMinusLedger = computeMatchPlusMinus(events, match.half_length * 60, {
        firstHalfStarterIds,
      })
      lineupChunks.push(
        computeLineupCombinationAnalytics(events, match.half_length * 60, roster, {
          firstHalfStarterIds,
        }),
      )
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
        const yellowCards = recap?.yellowCards ?? 0
        const redCards = recap?.redCards ?? 0
        const positions =
          player && recap
            ? resolvePlayerPositions(recap, player)
            : recap && recap.positions.length > 0
              ? recap.positions
              : [displayMatchPosition(stat.match_position)]

        const savedReviews = reviewsByPlayerPosition.get(stat.player_id) ?? []
        const overallReview =
          savedReviews.find((review) => isOverallReviewPosition(review.position)) ??
          (savedReviews.length === 1 ? savedReviews[0] : null) ?? {
            position: OVERALL_REVIEW_POSITION,
            impact: scoreToImpact(stat.impact_score),
            notes: '',
          }
        const roleReviews = savedReviews.filter((review) => !isOverallReviewPosition(review.position))

        entry.matchesPlayed += 1
        entry.totalMinutes += minutes
        entry.goals += goals
        entry.assists += assists
        entry.yellowCards += yellowCards
        entry.redCards += redCards
        entry.plusMinus += plusMinusLedger.get(stat.player_id) ?? stat.plus_minus ?? 0
        entry.ratingCounts[overallReview.impact] += 1

        const posMap = positionCounts.get(stat.player_id)!
        for (const position of positions) {
          incrementPositionCount(posMap, position)
        }

        const breakdownMap = positionBreakdownMaps.get(stat.player_id)!
        const ratedMatches = ratedMatchesByPosition.get(stat.player_id)!

        for (const rating of roleReviews) {
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

        if (overallReview.notes.trim()) {
          entry.feedbackHistory.push({
            matchId: match.id,
            opponent: match.opponent.trim() || 'Opponent',
            dateLabel,
            position: OVERALL_REVIEW_POSITION,
            impact: overallReview.impact,
            notes: overallReview.notes.trim(),
          })
        }

        entry.matchLogs.push({
          matchId: match.id,
          opponent: match.opponent.trim() || 'Opponent',
          venueLabel,
          dateLabel,
          minutes,
          goals,
          assists,
          yellowCards,
          redCards,
          plusMinus: plusMinusLedger.get(stat.player_id) ?? stat.plus_minus ?? 0,
          overallRating: {
            impact: overallReview.impact,
            notes: overallReview.notes,
          },
          positionRatings: roleReviews,
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
    entry.averageOverallRating = dominantImpact(entry.ratingCounts)
    entry.positionBreakdown = [...breakdownMap.values()]
      .map((item) => ({
        ...item,
        averageRating: dominantImpact(item.ratingCounts),
        positivePercent: positiveRatingPercent(item.ratingCounts),
      }))
      .sort((a, b) => b.matchCount - a.matchCount || a.position.localeCompare(b.position))
  }

  const mergedLineup = mergeLineupCombinationAnalytics(lineupChunks)
  const positionEfficiency = buildPositionEfficiencyFromPlayerStats(roster, playerStats)

  return {
    matches,
    seasonRecord,
    playerStats,
    lineupAnalytics: {
      ...mergedLineup,
      positionEfficiency,
    },
  }
}

function buildPositionEfficiencyFromPlayerStats(
  roster: RosterPlayer[],
  playerStats: Map<string, PlayerSeasonStats>,
) {
  const buckets = new Map<
    string,
    {
      plusMinus: number
      positive: number
      neutral: number
      negative: number
      players: Set<string>
      goals: number
      assists: number
    }
  >()

  for (const player of roster) {
    const stats = playerStats.get(player.id)
    if (!stats || stats.matchesPlayed === 0) continue

    const positions =
      stats.positionsPlayed.length > 0
        ? stats.positionsPlayed
        : stats.primaryPositionPlayed !== '—'
          ? [stats.primaryPositionPlayed]
          : []

    if (positions.length === 0) continue

    const share = 1 / positions.length
    for (const position of positions) {
      const bucket = buckets.get(position) ?? {
        plusMinus: 0,
        positive: 0,
        neutral: 0,
        negative: 0,
        players: new Set<string>(),
        goals: 0,
        assists: 0,
      }
      bucket.plusMinus += stats.plusMinus * share
      bucket.positive += stats.ratingCounts.positive * share
      bucket.neutral += stats.ratingCounts.neutral * share
      bucket.negative += stats.ratingCounts.negative * share
      bucket.players.add(player.id)
      bucket.goals += stats.goals * share
      bucket.assists += stats.assists * share
      buckets.set(position, bucket)
    }
  }

  return [...buckets.entries()]
    .map(([position, bucket]) => {
      const rated = bucket.positive + bucket.neutral + bucket.negative
      return {
        position,
        plusMinus: Math.round(bucket.plusMinus * 10) / 10,
        positivePercent: rated > 0 ? Math.round((bucket.positive / rated) * 100) : 0,
        players: bucket.players.size,
        goals: Math.round(bucket.goals * 10) / 10,
        assists: Math.round(bucket.assists * 10) / 10,
      }
    })
    .sort((a, b) => b.plusMinus - a.plusMinus || b.positivePercent - a.positivePercent)
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
  return `Performance as ${stats.position}: ${stats.positivePercent}% positive ratings`
}

export function formatPositionBreakdownDetail(stats: PlayerPositionRatingStats): string {
  const matchLabel = stats.matchCount === 1 ? 'match' : 'matches'
  return `${stats.matchCount} ${matchLabel} · ${stats.positivePercent}% positive (Avg: ${formatAverageRatingLabel(stats.averageRating)})`
}
