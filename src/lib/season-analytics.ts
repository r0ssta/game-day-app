import { getMatchSortTimestamp } from '@/lib/match-schedule'
import { resolveMatchLocationType, type LocationType } from '@/lib/match-location'
import { formatPlayerFullName } from '@/lib/player-names'
import { formatRecapMinutes } from '@/lib/match-recap'
import {
  emptyPlayerSeasonStats,
  type PlayerSeasonStats,
  computeSeasonRecord,
  type SeasonRecord,
  type SeasonReportData,
} from '@/lib/season-reporting'
import type { DbMatch } from '@/types/database'
import type { Impact, RosterPlayer } from '@/types/match'
import type { LineupCombinationAnalytics } from '@/lib/lineup-analytics'

export type PlayingTimeEntry = {
  playerId: string
  name: string
  jersey: number | null
  totalMinutes: number
  averageMinutesPerMatch: number
  matchesPlayed: number
  minutesSharePercent: number
}

export type PlayingTimeAnalytics = {
  leaders: PlayingTimeEntry[]
  teamTotalMinutes: number
  teamAverageMinutesPerMatch: number
  ironMan: PlayingTimeEntry | null
  rotationPlayers: PlayingTimeEntry[]
}

export type VenueRecord = {
  venue: LocationType
  wins: number
  losses: number
  draws: number
  goalsFor: number
  goalsAgainst: number
  matchesPlayed: number
  goalDifferential: number
  avgGoalsFor: number
  avgGoalsAgainst: number
}

export type ScoringTrendPoint = {
  monthKey: string
  monthLabel: string
  goalsFor: number
  goalsAgainst: number
  matchesPlayed: number
  goalDifferential: number
}

export type CleanSheetStats = {
  total: number
  home: number
  away: number
  ratePercent: number
}

export type ScoringDefenseAnalytics = {
  overall: SeasonRecord
  byVenue: VenueRecord[]
  monthlyTrend: ScoringTrendPoint[]
  cleanSheets: CleanSheetStats
}

export type RatingTrajectoryPoint = {
  matchId: string
  dateLabel: string
  opponent: string
  impact: Impact
}

export type PlayerDevelopmentEntry = {
  playerId: string
  name: string
  jersey: number | null
  matchesPlayed: number
  overallPositivePercent: number
  averageOverallRating: Impact
  versatilityScore: number
  uniquePositions: string[]
  roleSummaries: Array<{ position: string; positivePercent: number; matchCount: number }>
  ratingTrajectory: RatingTrajectoryPoint[]
}

export type PlayerDevelopmentAnalytics = {
  players: PlayerDevelopmentEntry[]
  teamPositivePercent: number
  ratedMatchCount: number
}

export type PlusMinusLeader = {
  playerId: string
  name: string
  jersey: number | null
  plusMinus: number
  matchesPlayed: number
  goals: number
  assists: number
}

export type PlusMinusAnalytics = {
  leaders: PlusMinusLeader[]
  topImpact: PlusMinusLeader | null
  teamPlusMinus: number
}

export type SeasonAnalytics = {
  playingTime: PlayingTimeAnalytics
  scoringDefense: ScoringDefenseAnalytics
  playerDevelopment: PlayerDevelopmentAnalytics
  plusMinus: PlusMinusAnalytics
  lineupCombinations: LineupCombinationAnalytics
  completedMatchCount: number
}

function positivePercent(counts: { positive: number; neutral: number; negative: number }): number {
  const total = counts.positive + counts.neutral + counts.negative
  return total > 0 ? Math.round((counts.positive / total) * 100) : 0
}

function matchMonthKey(match: DbMatch): string {
  const dateStr = match.match_date ?? match.date.slice(0, 10)
  const parsed = new Date(`${dateStr}T12:00:00`)
  if (Number.isNaN(parsed.getTime())) return dateStr.slice(0, 7) || 'unknown'
  const year = parsed.getFullYear()
  const month = String(parsed.getMonth() + 1).padStart(2, '0')
  return `${year}-${month}`
}

function matchMonthLabel(monthKey: string): string {
  const [year, month] = monthKey.split('-').map(Number)
  if (!year || !month) return monthKey
  const parsed = new Date(year, month - 1, 1)
  return parsed.toLocaleDateString(undefined, { month: 'short', year: 'numeric' })
}

function emptyVenueRecord(venue: LocationType): VenueRecord {
  return {
    venue,
    wins: 0,
    losses: 0,
    draws: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    matchesPlayed: 0,
    goalDifferential: 0,
    avgGoalsFor: 0,
    avgGoalsAgainst: 0,
  }
}

export function buildPlayingTimeAnalytics(
  roster: RosterPlayer[],
  playerStats: Map<string, PlayerSeasonStats>,
): PlayingTimeAnalytics {
  const leaders: PlayingTimeEntry[] = roster
    .map((player) => {
      const stats = playerStats.get(player.id) ?? emptyPlayerSeasonStats(player.id)
      return {
        playerId: player.id,
        name: formatPlayerFullName(player.firstName, player.lastName),
        jersey: player.number,
        totalMinutes: stats.totalMinutes,
        averageMinutesPerMatch: stats.averageMinutesPerMatch,
        matchesPlayed: stats.matchesPlayed,
        minutesSharePercent: 0,
      }
    })
    .filter((entry) => entry.matchesPlayed > 0)
    .sort((a, b) => b.totalMinutes - a.totalMinutes || b.averageMinutesPerMatch - a.averageMinutesPerMatch)

  const teamTotalMinutes = leaders.reduce((sum, entry) => sum + entry.totalMinutes, 0)
  for (const entry of leaders) {
    entry.minutesSharePercent =
      teamTotalMinutes > 0 ? Math.round((entry.totalMinutes / teamTotalMinutes) * 100) : 0
  }

  const teamAverageMinutesPerMatch =
    leaders.length > 0
      ? Math.round(leaders.reduce((sum, entry) => sum + entry.averageMinutesPerMatch, 0) / leaders.length)
      : 0

  const rotationPlayers = leaders.filter(
    (entry) => entry.averageMinutesPerMatch < teamAverageMinutesPerMatch,
  )

  return {
    leaders,
    teamTotalMinutes,
    teamAverageMinutesPerMatch,
    ironMan: leaders[0] ?? null,
    rotationPlayers,
  }
}

export function buildScoringDefenseAnalytics(matches: DbMatch[]): ScoringDefenseAnalytics {
  const overall = computeSeasonRecord(matches)
  const venueMap = new Map<LocationType, VenueRecord>([
    ['home', emptyVenueRecord('home')],
    ['away', emptyVenueRecord('away')],
  ])

  const monthMap = new Map<string, ScoringTrendPoint>()
  let cleanSheetsTotal = 0
  let cleanSheetsHome = 0
  let cleanSheetsAway = 0

  const sortedMatches = [...matches].sort(
    (a, b) => getMatchSortTimestamp(a) - getMatchSortTimestamp(b),
  )

  for (const match of sortedMatches) {
    const venue = resolveMatchLocationType(match)
    const venueRecord = venueMap.get(venue)!
    venueRecord.matchesPlayed += 1
    venueRecord.goalsFor += match.home_score
    venueRecord.goalsAgainst += match.away_score
    if (match.home_score > match.away_score) venueRecord.wins += 1
    else if (match.home_score < match.away_score) venueRecord.losses += 1
    else venueRecord.draws += 1

    if (match.away_score === 0) {
      cleanSheetsTotal += 1
      if (venue === 'home') cleanSheetsHome += 1
      else cleanSheetsAway += 1
    }

    const monthKey = matchMonthKey(match)
    const monthPoint = monthMap.get(monthKey) ?? {
      monthKey,
      monthLabel: matchMonthLabel(monthKey),
      goalsFor: 0,
      goalsAgainst: 0,
      matchesPlayed: 0,
      goalDifferential: 0,
    }
    monthPoint.goalsFor += match.home_score
    monthPoint.goalsAgainst += match.away_score
    monthPoint.matchesPlayed += 1
    monthMap.set(monthKey, monthPoint)
  }

  const byVenue = [...venueMap.values()].map((record) => {
    const goalDifferential = record.goalsFor - record.goalsAgainst
    return {
      ...record,
      goalDifferential,
      avgGoalsFor:
        record.matchesPlayed > 0
          ? Math.round((record.goalsFor / record.matchesPlayed) * 10) / 10
          : 0,
      avgGoalsAgainst:
        record.matchesPlayed > 0
          ? Math.round((record.goalsAgainst / record.matchesPlayed) * 10) / 10
          : 0,
    }
  })

  const monthlyTrend = [...monthMap.values()]
    .map((point) => ({
      ...point,
      goalDifferential: point.goalsFor - point.goalsAgainst,
    }))
    .sort((a, b) => a.monthKey.localeCompare(b.monthKey))

  const cleanSheets: CleanSheetStats = {
    total: cleanSheetsTotal,
    home: cleanSheetsHome,
    away: cleanSheetsAway,
    ratePercent:
      overall.matchesPlayed > 0
        ? Math.round((cleanSheetsTotal / overall.matchesPlayed) * 100)
        : 0,
  }

  return { overall, byVenue, monthlyTrend, cleanSheets }
}

export function buildPlayerDevelopmentAnalytics(
  roster: RosterPlayer[],
  playerStats: Map<string, PlayerSeasonStats>,
  matches: DbMatch[],
): PlayerDevelopmentAnalytics {
  const matchSortKey = new Map(matches.map((match) => [match.id, getMatchSortTimestamp(match)]))

  let teamPositive = 0
  let teamNeutral = 0
  let teamNegative = 0
  let ratedMatchCount = 0

  const players: PlayerDevelopmentEntry[] = roster
    .map((player) => {
      const stats = playerStats.get(player.id) ?? emptyPlayerSeasonStats(player.id)
      if (stats.matchesPlayed === 0) return null

      teamPositive += stats.ratingCounts.positive
      teamNeutral += stats.ratingCounts.neutral
      teamNegative += stats.ratingCounts.negative
      ratedMatchCount += stats.ratingCounts.positive + stats.ratingCounts.neutral + stats.ratingCounts.negative

      const ratingTrajectory = [...stats.matchLogs]
        .sort(
          (a, b) =>
            (matchSortKey.get(a.matchId) ?? 0) - (matchSortKey.get(b.matchId) ?? 0),
        )
        .map((log) => ({
          matchId: log.matchId,
          dateLabel: log.dateLabel,
          opponent: log.opponent,
          impact: log.overallRating.impact,
        }))

      const uniquePositions = [...new Set([...stats.positionsPlayed, ...stats.positionBreakdown.map((r) => r.position)])]
      const versatilityScore = uniquePositions.length + stats.positionBreakdown.length

      return {
        playerId: player.id,
        name: formatPlayerFullName(player.firstName, player.lastName),
        jersey: player.number,
        matchesPlayed: stats.matchesPlayed,
        overallPositivePercent: positivePercent(stats.ratingCounts),
        averageOverallRating: stats.averageOverallRating,
        versatilityScore,
        uniquePositions,
        roleSummaries: stats.positionBreakdown.map((role) => ({
          position: role.position,
          positivePercent: role.positivePercent,
          matchCount: role.matchCount,
        })),
        ratingTrajectory,
      }
    })
    .filter((entry): entry is PlayerDevelopmentEntry => entry !== null)
    .sort(
      (a, b) =>
        b.overallPositivePercent - a.overallPositivePercent ||
        b.versatilityScore - a.versatilityScore,
    )

  return {
    players,
    teamPositivePercent: positivePercent({
      positive: teamPositive,
      neutral: teamNeutral,
      negative: teamNegative,
    }),
    ratedMatchCount,
  }
}

export function buildPlusMinusAnalytics(
  roster: RosterPlayer[],
  playerStats: Map<string, PlayerSeasonStats>,
): PlusMinusAnalytics {
  const leaders: PlusMinusLeader[] = roster
    .map((player) => {
      const stats = playerStats.get(player.id) ?? emptyPlayerSeasonStats(player.id)
      return {
        playerId: player.id,
        name: formatPlayerFullName(player.firstName, player.lastName),
        jersey: player.number,
        plusMinus: stats.plusMinus,
        matchesPlayed: stats.matchesPlayed,
        goals: stats.goals,
        assists: stats.assists,
      }
    })
    .filter((entry) => entry.matchesPlayed > 0)
    .sort(
      (a, b) =>
        b.plusMinus - a.plusMinus ||
        b.goals - a.goals ||
        a.name.localeCompare(b.name),
    )

  const teamPlusMinus = leaders.reduce((sum, entry) => sum + entry.plusMinus, 0)

  return {
    leaders,
    topImpact: leaders[0] ?? null,
    teamPlusMinus,
  }
}

export function buildSeasonAnalytics(data: SeasonReportData, roster: RosterPlayer[]): SeasonAnalytics {
  return {
    playingTime: buildPlayingTimeAnalytics(roster, data.playerStats),
    scoringDefense: buildScoringDefenseAnalytics(data.matches),
    playerDevelopment: buildPlayerDevelopmentAnalytics(roster, data.playerStats, data.matches),
    plusMinus: buildPlusMinusAnalytics(roster, data.playerStats),
    lineupCombinations: data.lineupAnalytics,
    completedMatchCount: data.matches.length,
  }
}

export function formatImpactSymbol(impact: Impact): string {
  if (impact === 'positive') return '+'
  if (impact === 'negative') return '−'
  return '='
}

export function formatMinutesLabel(seconds: number): string {
  return formatRecapMinutes(seconds)
}
