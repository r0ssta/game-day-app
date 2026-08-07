import { formatMatchDisplayDateTime } from '@/lib/match-schedule'
import { formatOpponentWithVenue, resolveMatchLocationType } from '@/lib/match-location'
import { formatPlayerFullName } from '@/lib/player-names'
import { displayMatchPosition } from '@/lib/positions'
import {
  aggregatePlayerRecaps,
  formatRecapMinutes,
} from '@/lib/match-recap'
import {
  fetchCompletedMatchesByTeamId,
  fetchMatchEvents,
  fetchMatchReviews,
  fetchMatchStatsByMatchId,
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

export type PlayerMatchLog = {
  matchId: string
  opponent: string
  venueLabel: string
  dateLabel: string
  minutes: number
  goals: number
  assists: number
  impact: Impact
  notes: string
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
  feedbackHistory: Array<{
    matchId: string
    opponent: string
    dateLabel: string
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

  for (const player of roster) {
    positionCounts.set(player.id, new Map())
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
      const reviewsByPlayer = new Map(
        reviews.map((review) => [
          review.player_id,
          {
            impact: scoreToImpact(review.impact_score),
            notes: review.review_notes ?? '',
          },
        ]),
      )

      for (const stat of stats) {
        if (!stat.attending) continue

        const entry = playerStats.get(stat.player_id)
        if (!entry) continue

        const recap = eventStats.get(stat.player_id)
        const minutes = recap?.totalSeconds ?? stat.total_seconds_played ?? 0
        const goals = recap?.goals ?? 0
        const assists = recap?.assists ?? 0
        const positions =
          recap && recap.positions.length > 0
            ? recap.positions
            : [displayMatchPosition(stat.match_position)]
        const review = reviewsByPlayer.get(stat.player_id)
        const impact: Impact = review?.impact ?? scoreToImpact(stat.impact_score)

        entry.matchesPlayed += 1
        entry.totalMinutes += minutes
        entry.goals += goals
        entry.assists += assists
        entry.ratingCounts[impact] += 1

        const posMap = positionCounts.get(stat.player_id)!
        for (const position of positions) {
          incrementPositionCount(posMap, position)
        }

        if (review?.notes.trim()) {
          entry.feedbackHistory.push({
            matchId: match.id,
            opponent: match.opponent.trim() || 'Opponent',
            dateLabel,
            impact: review.impact,
            notes: review.notes.trim(),
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
          impact,
          notes: review?.notes.trim() ?? '',
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
