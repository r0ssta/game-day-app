import { z } from 'zod'
import { supabase } from '@/supabaseClient'
import { formatTeamDisplayName } from '@/lib/age-groups'
import { weekendWindow, type SaturdayWindow } from '@/lib/saturday-board'
import { parseDbRow } from '@/lib/zod-parse'
import type { ParentHubMatch, ParentHubPlayer } from '@/lib/parent-hub'

export type ParentHubResolveResult =
  | { kind: 'club'; clubId: string; clubSlug: string; clubName: string }
  | {
      kind: 'team'
      teamId: string
      teamSlug: string
      teamName: string
      clubId: string | null
      clubSlug: string | null
    }

export type ParentClubSeason = {
  id: string
  name: string
  status: string
  startsOn: string | null
  endsOn: string | null
}

export type ParentClubTeamSummary = {
  id: string
  slug: string
  name: string
  ageGroup: string | null
  brandColor: string | null
  logoUrl: string | null
  wins: number
  losses: number
  draws: number
  goalsFor: number
  goalsAgainst: number
  matchesPlayed: number
}

export type ParentClubScoreboardMatch = {
  id: string
  teamId: string
  teamSlug: string
  teamName: string
  ageGroup: string | null
  opponent: string
  status: string
  matchDate: string | null
  matchTime: string | null
  date: string | null
  locationType: string | null
  homeScore: number
  awayScore: number
  homePkScore: number
  awayPkScore: number
  pkWinnerIsUs: boolean | null
  period: string | null
  currentPeriod: number | null
  periodClockStarted: boolean
  clockSeconds: number
  parentFacingRecap: string | null
}

export type ParentClubHubPayload = {
  kind: 'club'
  clubId: string
  clubSlug: string
  clubName: string
  seasonId: string | null
  seasonName: string | null
  weekendStart: string
  weekendEnd: string
  seasons: ParentClubSeason[]
  teams: ParentClubTeamSummary[]
  weekendMatches: ParentClubScoreboardMatch[]
  liveNowMatches: ParentClubScoreboardMatch[]
}

export type ParentClubCoach = {
  name: string
  role: string
}

export type ParentClubTeamPayload = {
  kind: 'clubTeam'
  clubId: string
  clubSlug: string
  clubName: string
  teamId: string
  teamSlug: string
  teamName: string
  ageGroup: string | null
  brandColor: string | null
  logoUrl: string | null
  seasonId: string | null
  seasonName: string | null
  wins: number
  losses: number
  draws: number
  goalsFor: number
  goalsAgainst: number
  matchesPlayed: number
  coaches: ParentClubCoach[]
  players: ParentHubPlayer[]
  matches: ParentHubMatch[]
}

const ResolveSchema = z.union([
  z.object({
    kind: z.literal('club'),
    clubId: z.string().min(1),
    clubSlug: z.string().min(1),
    clubName: z.string().catch('Club'),
  }),
  z.object({
    kind: z.literal('team'),
    teamId: z.string().min(1),
    teamSlug: z.string().catch(''),
    teamName: z.string().catch('Team'),
    clubId: z.string().nullable().catch(null),
    clubSlug: z.string().nullable().catch(null),
  }),
])

const SeasonSchema = z.object({
  id: z.string().min(1),
  name: z.string().catch('Season'),
  status: z.string().catch('archived'),
  startsOn: z.string().nullable().catch(null),
  endsOn: z.string().nullable().catch(null),
})

const TeamSummarySchema = z.object({
  id: z.string().min(1),
  slug: z.string().catch(''),
  name: z.string().catch('Team'),
  ageGroup: z.string().nullable().catch(null),
  brandColor: z.string().nullable().catch(null),
  logoUrl: z.string().nullable().catch(null),
  wins: z.number().catch(0),
  losses: z.number().catch(0),
  draws: z.number().catch(0),
  goalsFor: z.number().catch(0),
  goalsAgainst: z.number().catch(0),
  matchesPlayed: z.number().catch(0),
})

const ScoreboardMatchSchema = z
  .object({
    id: z.string().min(1),
    teamId: z.string().min(1),
    teamSlug: z.string().catch(''),
    teamName: z.string().catch('Team'),
    ageGroup: z.string().nullable().catch(null),
    opponent: z.string().catch('Opponent'),
    status: z.string().catch('scheduled'),
    matchDate: z.string().nullable().catch(null),
    matchTime: z.string().nullable().catch(null),
    date: z.string().nullable().catch(null),
    locationType: z.string().nullable().catch(null),
    homeScore: z.number().catch(0),
    awayScore: z.number().catch(0),
    homePkScore: z.number().catch(0),
    awayPkScore: z.number().catch(0),
    pkWinnerIsUs: z.boolean().nullable().catch(null),
    period: z.string().nullable().catch(null),
    currentPeriod: z.number().nullable().catch(null),
    periodClockStarted: z.boolean().catch(false),
    clockSeconds: z.number().catch(0),
    parentFacingRecap: z.string().nullable().catch(null),
  })
  .passthrough()

const ClubHubSchema = z.object({
  kind: z.literal('club').catch('club'),
  clubId: z.string().min(1),
  clubSlug: z.string().min(1),
  clubName: z.string().catch('Club'),
  seasonId: z.string().nullable().catch(null),
  seasonName: z.string().nullable().catch(null),
  weekendStart: z.string().min(1),
  weekendEnd: z.string().min(1),
  seasons: z.array(SeasonSchema).catch([]),
  teams: z.array(TeamSummarySchema).catch([]),
  weekendMatches: z.array(ScoreboardMatchSchema).catch([]),
  liveNowMatches: z.array(ScoreboardMatchSchema).catch([]),
})

const ClubTeamSchema = z.object({
  kind: z.literal('clubTeam').catch('clubTeam'),
  clubId: z.string().min(1),
  clubSlug: z.string().min(1),
  clubName: z.string().catch('Club'),
  teamId: z.string().min(1),
  teamSlug: z.string().catch(''),
  teamName: z.string().catch('Team'),
  ageGroup: z.string().nullable().catch(null),
  brandColor: z.string().nullable().catch(null),
  logoUrl: z.string().nullable().catch(null),
  seasonId: z.string().nullable().catch(null),
  seasonName: z.string().nullable().catch(null),
  wins: z.number().catch(0),
  losses: z.number().catch(0),
  draws: z.number().catch(0),
  goalsFor: z.number().catch(0),
  goalsAgainst: z.number().catch(0),
  matchesPlayed: z.number().catch(0),
  coaches: z
    .array(
      z.object({
        name: z.string().catch('Coach'),
        role: z.string().catch('head_coach'),
      }),
    )
    .catch([]),
  players: z
    .array(
      z.object({
        id: z.string().min(1),
        firstName: z.string().catch(''),
        lastName: z.string().catch(''),
        number: z.number().nullable().catch(null),
        position: z.string().nullable().optional().catch(null),
      }),
    )
    .catch([]),
  matches: z.array(z.record(z.string(), z.unknown())).catch([]),
})

export async function resolveParentHubSlug(slug: string): Promise<ParentHubResolveResult> {
  const { data, error } = await supabase.rpc('resolve_parent_hub_slug', {
    p_slug: slug.trim().toLowerCase(),
  })
  if (error) throw error
  const parsed = parseDbRow(ResolveSchema, data, 'resolve_parent_hub_slug')
  if (!parsed) throw new Error('Hub not found')
  return parsed
}

function normalizeScoreboardMatch(
  row: z.infer<typeof ScoreboardMatchSchema>,
): ParentClubScoreboardMatch {
  return {
    id: row.id,
    teamId: row.teamId,
    teamSlug: row.teamSlug,
    teamName: row.teamName,
    ageGroup: row.ageGroup,
    opponent: row.opponent,
    status: row.status,
    matchDate: row.matchDate,
    matchTime: row.matchTime,
    date: row.date,
    locationType: row.locationType,
    homeScore: row.homeScore,
    awayScore: row.awayScore,
    homePkScore: row.homePkScore,
    awayPkScore: row.awayPkScore,
    pkWinnerIsUs: row.pkWinnerIsUs,
    period: row.period,
    currentPeriod: row.currentPeriod,
    periodClockStarted: row.periodClockStarted,
    clockSeconds: row.clockSeconds,
    parentFacingRecap: row.parentFacingRecap,
  }
}

export function normalizeParentClubHub(data: unknown): ParentClubHubPayload {
  const parsed = parseDbRow(ClubHubSchema, data, 'get_parent_club_hub')
  if (!parsed?.clubId) throw new Error('Club hub not found')
  return {
    kind: 'club',
    clubId: parsed.clubId,
    clubSlug: parsed.clubSlug,
    clubName: parsed.clubName,
    seasonId: parsed.seasonId,
    seasonName: parsed.seasonName,
    weekendStart: parsed.weekendStart,
    weekendEnd: parsed.weekendEnd,
    seasons: parsed.seasons,
    teams: parsed.teams,
    weekendMatches: parsed.weekendMatches.map(normalizeScoreboardMatch),
    liveNowMatches: parsed.liveNowMatches.map(normalizeScoreboardMatch),
  }
}

function normalizeTeamMatch(row: Record<string, unknown>): ParentHubMatch {
  return {
    id: String(row.id ?? ''),
    opponent: typeof row.opponent === 'string' ? row.opponent : 'Opponent',
    status: (typeof row.status === 'string' ? row.status : 'scheduled') as ParentHubMatch['status'],
    match_date: typeof row.match_date === 'string' ? row.match_date : null,
    match_time: typeof row.match_time === 'string' ? row.match_time : null,
    date: typeof row.date === 'string' ? row.date : '',
    location_type: typeof row.location_type === 'string' ? row.location_type : null,
    home_score: typeof row.home_score === 'number' ? row.home_score : 0,
    away_score: typeof row.away_score === 'number' ? row.away_score : 0,
    home_pk_score: typeof row.home_pk_score === 'number' ? row.home_pk_score : 0,
    away_pk_score: typeof row.away_pk_score === 'number' ? row.away_pk_score : 0,
    pk_winner_is_us:
      row.pk_winner_is_us === true || row.pk_winner_is_us === false ? row.pk_winner_is_us : null,
    period: typeof row.period === 'string' ? row.period : '',
    current_period: typeof row.current_period === 'number' ? row.current_period : null,
    total_periods: typeof row.total_periods === 'number' ? row.total_periods : null,
    period_length: typeof row.period_length === 'number' ? row.period_length : null,
    half_length: typeof row.half_length === 'number' ? row.half_length : 0,
    period_clock_started: Boolean(row.period_clock_started),
    clock_seconds: typeof row.clock_seconds === 'number' ? row.clock_seconds : 0,
    parent_facing_recap:
      typeof row.parent_facing_recap === 'string' ? row.parent_facing_recap : null,
    isTest: Boolean(row.isTest),
  }
}

export function normalizeParentClubTeam(data: unknown): ParentClubTeamPayload {
  const parsed = parseDbRow(ClubTeamSchema, data, 'get_parent_club_team')
  if (!parsed?.teamId) throw new Error('Team not found')
  return {
    kind: 'clubTeam',
    clubId: parsed.clubId,
    clubSlug: parsed.clubSlug,
    clubName: parsed.clubName,
    teamId: parsed.teamId,
    teamSlug: parsed.teamSlug,
    teamName: parsed.teamName,
    ageGroup: parsed.ageGroup,
    brandColor: parsed.brandColor,
    logoUrl: parsed.logoUrl,
    seasonId: parsed.seasonId,
    seasonName: parsed.seasonName,
    wins: parsed.wins,
    losses: parsed.losses,
    draws: parsed.draws,
    goalsFor: parsed.goalsFor,
    goalsAgainst: parsed.goalsAgainst,
    matchesPlayed: parsed.matchesPlayed,
    coaches: parsed.coaches,
    players: parsed.players.map((player) => ({
      id: player.id,
      firstName: player.firstName,
      lastName: player.lastName,
      number: player.number,
    })),
    matches: parsed.matches
      .map((row) => normalizeTeamMatch(row))
      .filter((match) => Boolean(match.id)),
  }
}

export async function fetchParentClubHub(input: {
  clubSlug: string
  seasonId?: string | null
  weekendStart?: string | null
}): Promise<ParentClubHubPayload> {
  const { data, error } = await supabase.rpc('get_parent_club_hub', {
    p_club_slug: input.clubSlug.trim().toLowerCase(),
    p_season_id: input.seasonId ?? null,
    p_weekend_start: input.weekendStart ?? null,
  })
  if (error) throw error
  return normalizeParentClubHub(data)
}

export async function fetchParentClubTeam(input: {
  clubSlug: string
  teamSlug: string
  seasonId?: string | null
}): Promise<ParentClubTeamPayload> {
  const { data, error } = await supabase.rpc('get_parent_club_team', {
    p_club_slug: input.clubSlug.trim().toLowerCase(),
    p_team_slug: input.teamSlug.trim().toLowerCase(),
    p_season_id: input.seasonId ?? null,
  })
  if (error) throw error
  return normalizeParentClubTeam(data)
}

export function clubTeamDisplayName(team: {
  name: string
  ageGroup?: string | null
}): string {
  return formatTeamDisplayName(team.name, team.ageGroup ?? null)
}

export function recordLabel(team: {
  wins: number
  losses: number
  draws: number
}): string {
  return `${team.wins}-${team.losses}-${team.draws}`
}

export function coachRoleLabel(role: string): string {
  if (role === 'head_coach') return 'Head coach'
  if (role === 'assistant_coach') return 'Assistant coach'
  return 'Coach'
}

export function scoreboardMatchToParentHubMatch(
  match: ParentClubScoreboardMatch,
): ParentHubMatch {
  return {
    id: match.id,
    opponent: match.opponent,
    status: match.status as ParentHubMatch['status'],
    match_date: match.matchDate,
    match_time: match.matchTime,
    date: match.date ?? '',
    location_type: match.locationType,
    home_score: match.homeScore,
    away_score: match.awayScore,
    home_pk_score: match.homePkScore,
    away_pk_score: match.awayPkScore,
    pk_winner_is_us: match.pkWinnerIsUs,
    period: match.period ?? '',
    current_period: match.currentPeriod,
    total_periods: null,
    period_length: null,
    half_length: 0,
    period_clock_started: match.periodClockStarted,
    clock_seconds: match.clockSeconds,
    parent_facing_recap: match.parentFacingRecap,
  }
}

export function readClubHubQueryState(search = window.location.search): {
  tab: 'scoreboard' | 'teams'
  seasonId: string | null
  weekendStart: string | null
  teamSlug: string | null
  matchId: string | null
} {
  const params = new URLSearchParams(search)
  const tabRaw = params.get('tab')?.trim().toLowerCase()
  const tab = tabRaw === 'teams' ? 'teams' : 'scoreboard'
  return {
    tab,
    seasonId: params.get('season')?.trim() || null,
    weekendStart: params.get('weekend')?.trim() || null,
    teamSlug: params.get('team')?.trim().toLowerCase() || null,
    matchId: params.get('match')?.trim() || null,
  }
}

export function buildClubHubSearch(input: {
  tab?: 'scoreboard' | 'teams'
  seasonId?: string | null
  weekendStart?: string | null
  teamSlug?: string | null
  matchId?: string | null
  currentWeekend?: SaturdayWindow | null
}): string {
  const params = new URLSearchParams()
  if (input.tab && input.tab !== 'scoreboard') params.set('tab', input.tab)
  if (input.seasonId) params.set('season', input.seasonId)
  const current = input.currentWeekend ?? weekendWindow(new Date())
  if (input.weekendStart && input.weekendStart !== current.start) {
    params.set('weekend', input.weekendStart)
  }
  if (input.teamSlug) params.set('team', input.teamSlug)
  if (input.matchId) params.set('match', input.matchId)
  const qs = params.toString()
  return qs ? `?${qs}` : ''
}

export function replaceClubHubUrl(
  clubSlug: string,
  state: {
    tab?: 'scoreboard' | 'teams'
    seasonId?: string | null
    weekendStart?: string | null
    teamSlug?: string | null
    matchId?: string | null
  },
): void {
  const path = `/hub/${encodeURIComponent(clubSlug)}`
  const next = `${path}${buildClubHubSearch({
    ...state,
    currentWeekend: weekendWindow(new Date()),
  })}`
  const current = `${window.location.pathname}${window.location.search}`
  if (current !== next) {
    window.history.replaceState(null, '', next)
  }
}
