import { formatTeamDisplayName } from '@/lib/age-groups'
import { formatMatchDisplayDateTime } from '@/lib/match-schedule'
import { formatOpponentWithVenue, resolveMatchLocationType } from '@/lib/match-location'
import { aggregatePlayerRecaps } from '@/lib/match-recap'
import { computeMatchPlusMinus } from '@/lib/plus-minus'
import { formatSeasonDateRange } from '@/lib/season-dates'
import {
  aggregateMicroStats,
  emptyPlayerMicroStats,
  type PlayerMicroStats,
} from '@/lib/stat-tracker'
import {
  fetchMatchEvents,
  fetchMatchStatsByMatchId,
  fetchPlayerMatchAppearances,
  fetchPlayersByIds,
  fetchSeasonRosterHistoryForPlayer,
  fetchTeamsByIds,
  type SeasonRosterHistoryRow,
} from '@/lib/supabase-api'
import type { DbPlayer, DbSeason, DbTeam } from '@/types/database'

export type PlayerDevelopmentTimeframe = 'career' | 'season'

export type PlayerDevelopmentTotals = {
  matchesPlayed: number
  /** Cumulative seconds on pitch */
  totalSeconds: number
  goals: number
  assists: number
  yellowCards: number
  redCards: number
  tackles: number
  keyPasses: number
  plusMinus: number
}

export type PlayerRosterHistoryEntry = {
  seasonId: string
  seasonName: string
  seasonStatus: DbSeason['status']
  seasonRangeLabel: string | null
  teamId: string
  teamName: string
  teamAgeGroup: string | null
  jersey: number | null
}

export type PlayerGuestAppearance = {
  matchId: string
  teamId: string
  teamName: string
  opponent: string
  dateLabel: string
  seasonId: string | null
}

export type PlayerDevelopmentReport = {
  player: DbPlayer
  currentPrimaryTeam: { teamId: string; teamName: string; jersey: number | null } | null
  rosterHistory: PlayerRosterHistoryEntry[]
  guestAppearances: PlayerGuestAppearance[]
  activeSeason: DbSeason | null
  careerTotals: PlayerDevelopmentTotals
  seasonTotals: PlayerDevelopmentTotals
}

function emptyTotals(): PlayerDevelopmentTotals {
  return {
    matchesPlayed: 0,
    totalSeconds: 0,
    goals: 0,
    assists: 0,
    yellowCards: 0,
    redCards: 0,
    tackles: 0,
    keyPasses: 0,
    plusMinus: 0,
  }
}

function addMicro(totals: PlayerDevelopmentTotals, micro: PlayerMicroStats | undefined) {
  if (!micro) return
  totals.tackles += micro.tackles
  totals.keyPasses += micro.keyPasses
}

function toRosterHistoryEntry(row: SeasonRosterHistoryRow): PlayerRosterHistoryEntry {
  return {
    seasonId: row.season.id,
    seasonName: row.season.name,
    seasonStatus: row.season.status,
    seasonRangeLabel: formatSeasonDateRange(row.season.starts_on, row.season.ends_on),
    teamId: row.team.id,
    teamName: formatTeamDisplayName(row.team.name, row.team.age_group),
    teamAgeGroup: row.team.age_group ?? null,
    jersey: row.roster.primary_jersey_number,
  }
}

export function selectDevelopmentTotals(
  report: PlayerDevelopmentReport,
  timeframe: PlayerDevelopmentTimeframe,
): PlayerDevelopmentTotals {
  return timeframe === 'season' ? report.seasonTotals : report.careerTotals
}

export function filterGuestAppearances(
  report: PlayerDevelopmentReport,
  timeframe: PlayerDevelopmentTimeframe,
): PlayerGuestAppearance[] {
  if (timeframe === 'career' || !report.activeSeason) return report.guestAppearances
  return report.guestAppearances.filter((entry) => entry.seasonId === report.activeSeason?.id)
}

export function filterRosterHistory(
  report: PlayerDevelopmentReport,
  timeframe: PlayerDevelopmentTimeframe,
): PlayerRosterHistoryEntry[] {
  if (timeframe === 'career' || !report.activeSeason) return report.rosterHistory
  return report.rosterHistory.filter((entry) => entry.seasonId === report.activeSeason?.id)
}

function teamLabel(team: DbTeam | undefined, fallback = 'Team'): string {
  if (!team) return fallback
  return formatTeamDisplayName(team.name, team.age_group)
}

export async function loadPlayerDevelopmentReport(input: {
  playerId: string
  activeSeason: DbSeason | null
  teams: DbTeam[]
}): Promise<PlayerDevelopmentReport> {
  const { playerId, activeSeason, teams } = input
  const teamsById = new Map(teams.map((team) => [team.id, team]))

  const [players, rosterHistoryRaw, appearances] = await Promise.all([
    fetchPlayersByIds([playerId]),
    fetchSeasonRosterHistoryForPlayer(playerId),
    fetchPlayerMatchAppearances(playerId),
  ])

  const player = players[0]
  if (!player) throw new Error('Player not found')

  for (const row of rosterHistoryRaw) {
    teamsById.set(row.team.id, row.team)
  }

  const missingTeamIds = [
    ...new Set(
      appearances.map((row) => row.match.team_id).filter((teamId) => !teamsById.has(teamId)),
    ),
  ]
  if (missingTeamIds.length > 0) {
    const fetched = await fetchTeamsByIds(missingTeamIds)
    for (const team of fetched) teamsById.set(team.id, team)
  }

  const rosterHistory = rosterHistoryRaw.map(toRosterHistoryEntry)

  const primaryTeamIdsBySeason = new Map<string, Set<string>>()
  for (const row of rosterHistoryRaw) {
    const set = primaryTeamIdsBySeason.get(row.season.id) ?? new Set<string>()
    set.add(row.team.id)
    primaryTeamIdsBySeason.set(row.season.id, set)
  }

  let currentPrimaryTeam: PlayerDevelopmentReport['currentPrimaryTeam'] = null
  if (activeSeason) {
    const activeRows = rosterHistoryRaw.filter((row) => row.season.id === activeSeason.id)
    const preferred =
      activeRows.find((row) => row.team.active_status !== false) ?? activeRows[0] ?? null
    if (preferred) {
      currentPrimaryTeam = {
        teamId: preferred.team.id,
        teamName: teamLabel(preferred.team),
        jersey: preferred.roster.primary_jersey_number,
      }
    }
  }
  if (!currentPrimaryTeam && rosterHistoryRaw[0]) {
    const latest = rosterHistoryRaw[0]
    currentPrimaryTeam = {
      teamId: latest.team.id,
      teamName: teamLabel(latest.team),
      jersey: latest.roster.primary_jersey_number,
    }
  }

  const careerTotals = emptyTotals()
  const seasonTotals = emptyTotals()
  const guestAppearances: PlayerGuestAppearance[] = []

  // Group by match so we only fetch events/stats once per match
  const byMatch = new Map<string, (typeof appearances)[number]>()
  for (const appearance of appearances) {
    byMatch.set(appearance.match.id, appearance)
  }

  await Promise.all(
    [...byMatch.values()].map(async ({ match, stat }) => {
      const [events, allStats] = await Promise.all([
        fetchMatchEvents(match.id),
        fetchMatchStatsByMatchId(match.id),
      ])
      const eventStats = aggregatePlayerRecaps(events, match.half_length * 60)
      const microByPlayer = aggregateMicroStats(events)
      const firstHalfStarterIds = allStats
        .filter((row) => row.is_first_half_starter)
        .map((row) => row.player_id)
      const plusMinusLedger = computeMatchPlusMinus(events, match.half_length * 60, {
        firstHalfStarterIds,
      })

      const recap = eventStats.get(playerId)
      const micro = microByPlayer.get(playerId) ?? emptyPlayerMicroStats()
      const seconds = recap?.totalSeconds ?? stat.total_seconds_played ?? 0
      const goals = recap?.goals ?? 0
      const assists = recap?.assists ?? 0
      const yellowCards = recap?.yellowCards ?? 0
      const redCards = recap?.redCards ?? 0
      const plusMinus = plusMinusLedger.get(playerId) ?? stat.plus_minus ?? 0

      const applyTo = (totals: PlayerDevelopmentTotals) => {
        totals.matchesPlayed += 1
        totals.totalSeconds += seconds
        totals.goals += goals
        totals.assists += assists
        totals.yellowCards += yellowCards
        totals.redCards += redCards
        totals.plusMinus += plusMinus
        addMicro(totals, micro)
      }

      applyTo(careerTotals)
      if (activeSeason && match.season_id === activeSeason.id) {
        applyTo(seasonTotals)
      }

      const seasonPrimary = match.season_id
        ? primaryTeamIdsBySeason.get(match.season_id)
        : undefined
      const isGuest =
        Boolean(stat.is_match_guest) ||
        (seasonPrimary ? !seasonPrimary.has(match.team_id) : false)

      if (isGuest) {
        const { dateLabel } = formatMatchDisplayDateTime(match)
        guestAppearances.push({
          matchId: match.id,
          teamId: match.team_id,
          teamName: teamLabel(teamsById.get(match.team_id)),
          opponent: formatOpponentWithVenue(
            match.opponent,
            resolveMatchLocationType(match),
          ),
          dateLabel,
          seasonId: match.season_id ?? null,
        })
      }
    }),
  )

  return {
    player,
    currentPrimaryTeam,
    rosterHistory,
    guestAppearances,
    activeSeason,
    careerTotals,
    seasonTotals,
  }
}
