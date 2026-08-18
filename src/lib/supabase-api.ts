import {
  resolvePlayerNameFields,
} from '@/lib/player-names'
import {
  DEFAULT_PRIMARY_POSITION,
  DEFAULT_SECONDARY_POSITION,
  legacyPositionToProfile,
  normalizeRecapPosition,
  rosterProfilePositionToLegacy,
} from '@/lib/positions'
import { supabase } from '@/supabaseClient'
import { getAuthRedirectUrl } from '@/lib/auth-redirect'
import { createMatchPlayer } from '@/lib/play-time'
import { computeMatchPlusMinus } from '@/lib/plus-minus'
import { getMatchSortTimestamp, matchDateTimeIso } from '@/lib/match-schedule'
import type { LocationType } from '@/lib/match-location'
import {
  addedTimeSeconds,
  persistableClockSeconds,
} from '@/lib/match-clock'
import {
  parseQualitativeContext,
  serializeQualitativeContext,
  type QualitativeContext,
} from '@/lib/qualitative-context'
import { generateStatTrackerToken, normalizeStatTrackerToken, type StatTrackerEventType, type StatTrackerRosterPlayer, rosterPlayerFromDb } from '@/lib/stat-tracker'
import type {
  DbCoach,
  DbLineupPreset,
  DbMatch,
  DbMatchEvent,
  DbMatchReview,
  DbMatchStat,
  DbPlayer,
  DbSeason,
  DbSeasonRoster,
  DbTeam,
  SeasonStatus,
} from '@/types/database'
import type { LineupPresetFormationJson } from '@/lib/lineup-presets'
import type { Impact, MatchPeriod, MatchPlayer, RosterPlayer } from '@/types/match'
import {
  type AppRole,
  type AssignableAppRole,
  type TeamRole,
  isAppRole,
  isAssignableAppRole,
  isTeamRole,
} from '@/lib/staff-roles'
import { type AgeGroup, formatForAgeGroup } from '@/lib/age-groups'

export type MatchEventInput = {
  matchId: string
  eventType:
    | 'goal'
    | 'assist'
    | 'sub_in'
    | 'sub_out'
    | 'position_change'
    | 'opponent_goal'
    | 'formation_change'
    | StatTrackerEventType
    | 'stat_team_log'
  timestamp: number
  formation: string
  playerId?: string | null
  eventNotes?: string | null
  assistPlayerId?: string | null
}

function matchEventToRow(event: MatchEventInput, includeExtended = true) {
  const row = {
    match_id: event.matchId,
    player_id: event.playerId ?? null,
    event_type: event.eventType,
    timestamp: event.timestamp,
    event_notes: event.eventNotes ?? null,
  }
  if (!includeExtended) return row

  const extended: Record<string, unknown> = { ...row, formation: event.formation }
  if (event.eventType === 'goal') {
    extended.assist_player_id = event.assistPlayerId ?? null
  }
  return extended
}

export function formatSupabaseError(err: unknown): string {
  if (err && typeof err === 'object' && 'message' in err) {
    return String((err as { message: unknown }).message)
  }
  if (err instanceof Error) return err.message
  return 'Unknown error'
}

function isMissingColumnError(err: unknown): boolean {
  const message = formatSupabaseError(err).toLowerCase()
  return (
    message.includes('column') &&
    (message.includes('does not exist') ||
      message.includes('could not find') ||
      message.includes('schema cache'))
  )
}

/** match_reviews is optional until migration is applied */
function isOptionalTableError(err: unknown): boolean {
  const message = formatSupabaseError(err).toLowerCase()
  return (
    message.includes('match_reviews') &&
    (message.includes('does not exist') ||
      message.includes('could not find') ||
      message.includes('schema cache') ||
      message.includes('permission denied') ||
      message.includes('not found'))
  )
}

async function insertMatchEventRows(
  rows: Array<ReturnType<typeof matchEventToRow>>,
): Promise<void> {
  if (rows.length === 0) return

  const { error } = await supabase.from('match_events').insert(rows)
  if (!error) return

  if (isMissingColumnError(error)) {
    const withoutExtendedColumns = rows.map((row) => {
      const {
        formation: _formation,
        assist_player_id: _assistPlayerId,
        ...keep
      } = row as Record<string, unknown> & {
        formation?: string
        assist_player_id?: string | null
      }
      return keep
    })
    const { error: legacyError } = await supabase.from('match_events').insert(withoutExtendedColumns)
    if (legacyError) throw legacyError
    return
  }

  throw error
}

export type ActiveMatchBundle = {
  match: DbMatch
  team: DbTeam
  coach: DbCoach | null
  stats: DbMatchStat[]
}

export function impactToScore(impact: Impact): number {
  if (impact === 'positive') return 1
  if (impact === 'negative') return -1
  return 0
}

export function scoreToImpact(score: number): Impact {
  if (score > 0) return 'positive'
  if (score < 0) return 'negative'
  return 'neutral'
}

export function dbPlayerToRoster(
  player: DbPlayer,
  options?: {
    teamId?: string | null
    jersey?: number | null
    isGuest?: boolean
  },
): RosterPlayer {
  const primaryPosition = player.primary_position ?? legacyPositionToProfile(player.position)
  const secondaryPosition = player.secondary_position ?? primaryPosition
  const { firstName, lastName } = resolvePlayerNameFields(player)

  return {
    id: player.id,
    teamId: options?.teamId ?? '',
    number: options?.jersey !== undefined ? options.jersey : player.jersey,
    firstName,
    lastName,
    position: player.position,
    primaryPosition,
    secondaryPosition,
    ageGroup: player.age_group ?? null,
    isGuest: options?.isGuest ?? false,
    activeStatus: player.active_status,
  }
}

export function statToMatchPlayer(roster: RosterPlayer, stat: DbMatchStat): MatchPlayer {
  return {
    ...roster,
    isGuest: Boolean(stat.is_match_guest) || roster.isGuest,
    impact: scoreToImpact(stat.impact_score),
    attending: stat.attending,
    isFirstHalfStarter: stat.is_first_half_starter,
    isSecondHalfStarter: stat.is_second_half_starter,
    isOnField: stat.attending && stat.match_status === 'on-field',
    matchPosition: stat.match_position,
    totalSecondsPlayed: stat.total_seconds_played,
    subbedInAt: stat.subbed_in_at,
    plusMinus: stat.plus_minus ?? 0,
  }
}

function matchStatusFromPlayer(player: MatchPlayer) {
  if (!player.attending) return 'absent' as const
  return player.isOnField ? ('on-field' as const) : ('bench' as const)
}

export function matchPlayerToStatPayload(matchId: string, player: MatchPlayer) {
  const liveMinutes = player.totalSecondsPlayed / 60
  return {
    match_id: matchId,
    player_id: player.id,
    total_minutes: liveMinutes,
    impact_score: impactToScore(player.impact),
    match_status: matchStatusFromPlayer(player),
    match_position: player.matchPosition,
    total_seconds_played: player.totalSecondsPlayed,
    subbed_in_at: player.subbedInAt,
    is_first_half_starter: player.isFirstHalfStarter,
    is_second_half_starter: player.isSecondHalfStarter,
    attending: player.attending,
    plus_minus: player.plusMinus,
    is_match_guest: player.isGuest,
  }
}

function logSyncError(label: string, error: unknown) {
  console.error(`[supabase] ${label}`, error)
}

export async function fetchTeams(options?: {
  includeArchived?: boolean
}): Promise<DbTeam[]> {
  let query = supabase.from('teams').select('*').order('name')
  if (!options?.includeArchived) query = query.eq('active_status', true)
  const { data, error } = await query
  if (error) throw error
  return data ?? []
}

export async function fetchTeamsByIds(teamIds: string[]): Promise<DbTeam[]> {
  const unique = [...new Set(teamIds.filter(Boolean))]
  if (unique.length === 0) return []
  const { data, error } = await supabase.from('teams').select('*').in('id', unique)
  if (error) throw error
  return data ?? []
}

export async function fetchCoaches(): Promise<DbCoach[]> {
  const { data, error } = await supabase.from('coaches').select('*').order('name')
  if (error) throw error
  return data ?? []
}

export async function fetchPlayersByTeamId(
  teamId: string,
  options?: { includeInactive?: boolean; seasonId?: string },
): Promise<DbPlayer[]> {
  // Prefer season roster when seasonId provided; fall back to empty if none.
  if (options?.seasonId) {
    const roster = await fetchSeasonRosterPlayers(options.seasonId, teamId, options)
    return roster.map((entry) => entry.player)
  }
  // Legacy callers without season: return empty — players are no longer team-scoped.
  void teamId
  return []
}

export type SeasonRosterEntry = {
  roster: DbSeasonRoster
  player: DbPlayer
}

/** Primary team roster for a season (joined player rows). */
export async function fetchSeasonRosterPlayers(
  seasonId: string,
  teamId: string,
  options?: { includeInactive?: boolean },
): Promise<SeasonRosterEntry[]> {
  const { data, error } = await supabase
    .from('season_rosters')
    .select('*, players(*)')
    .eq('season_id', seasonId)
    .eq('team_id', teamId)
  if (error) throw error

  const rows = (data ?? []) as Array<DbSeasonRoster & { players: DbPlayer | DbPlayer[] | null }>
  return rows
    .map((row) => {
      const player = Array.isArray(row.players) ? row.players[0] : row.players
      if (!player) return null
      if (!options?.includeInactive && !player.active_status) return null
      const { players: _players, ...roster } = row
      return { roster, player }
    })
    .filter((entry): entry is SeasonRosterEntry => entry !== null)
    .sort((a, b) => {
      const ja = a.roster.primary_jersey_number ?? a.player.jersey ?? 9999
      const jb = b.roster.primary_jersey_number ?? b.player.jersey ?? 9999
      return ja - jb
    })
}

export async function fetchPlayersByIds(playerIds: string[]): Promise<DbPlayer[]> {
  const unique = [...new Set(playerIds.filter(Boolean))]
  if (unique.length === 0) return []
  const { data, error } = await supabase.from('players').select('*').in('id', unique)
  if (error) throw error
  return data ?? []
}

export async function fetchAgeGroupPoolPlayers(
  ageGroup: AgeGroup,
  options?: { includeInactive?: boolean },
): Promise<DbPlayer[]> {
  let query = supabase.from('players').select('*').eq('age_group', ageGroup)
  if (!options?.includeInactive) query = query.eq('active_status', true)
  const { data, error } = await query
    .order('last_name')
    .order('first_name')
  if (error) throw error
  return data ?? []
}

/** Map of player_id → team_id for primary season roster assignments. */
export async function fetchSeasonRosterTeamByPlayerId(
  seasonId: string,
): Promise<Map<string, string>> {
  const { data, error } = await supabase
    .from('season_rosters')
    .select('player_id, team_id')
    .eq('season_id', seasonId)
  if (error) throw error

  const map = new Map<string, string>()
  for (const row of data ?? []) {
    if (row.player_id && row.team_id) map.set(row.player_id, row.team_id)
  }
  return map
}

/** Club-wide player directory (Director). */
export async function fetchClubPlayers(options?: {
  includeInactive?: boolean
  ageGroup?: AgeGroup | null
}): Promise<DbPlayer[]> {
  let query = supabase.from('players').select('*')
  if (!options?.includeInactive) query = query.eq('active_status', true)
  if (options?.ageGroup) query = query.eq('age_group', options.ageGroup)
  const { data, error } = await query.order('last_name').order('first_name')
  if (error) throw error
  return data ?? []
}

export type SeasonRosterHistoryRow = {
  roster: DbSeasonRoster
  team: DbTeam
  season: DbSeason
}

/** Primary roster assignments for a player across seasons. */
export async function fetchSeasonRosterHistoryForPlayer(
  playerId: string,
): Promise<SeasonRosterHistoryRow[]> {
  const { data, error } = await supabase
    .from('season_rosters')
    .select('*, teams(*), seasons(*)')
    .eq('player_id', playerId)
  if (error) throw error

  const rows: SeasonRosterHistoryRow[] = []
  for (const raw of data ?? []) {
    const row = raw as DbSeasonRoster & {
      teams: DbTeam | DbTeam[] | null
      seasons: DbSeason | DbSeason[] | null
    }
    const team = Array.isArray(row.teams) ? row.teams[0] : row.teams
    const season = Array.isArray(row.seasons) ? row.seasons[0] : row.seasons
    if (!team || !season) continue
    rows.push({
      roster: {
        id: row.id,
        season_id: row.season_id,
        team_id: row.team_id,
        player_id: row.player_id,
        primary_jersey_number: row.primary_jersey_number,
        created_at: row.created_at,
      },
      team,
      season,
    })
  }

  return rows.sort((a, b) => {
    const aStart = a.season.starts_on ?? a.season.created_at
    const bStart = b.season.starts_on ?? b.season.created_at
    return bStart.localeCompare(aStart)
  })
}

export type PlayerMatchAppearanceRow = {
  stat: DbMatchStat
  match: DbMatch
}

/** Completed matches where the player was marked attending. */
export async function fetchPlayerMatchAppearances(
  playerId: string,
): Promise<PlayerMatchAppearanceRow[]> {
  const { data, error } = await supabase
    .from('match_stats')
    .select('*, matches(*)')
    .eq('player_id', playerId)
    .eq('attending', true)
  if (error) throw error

  const rows: PlayerMatchAppearanceRow[] = []
  for (const raw of data ?? []) {
    const row = raw as DbMatchStat & { matches: DbMatch | DbMatch[] | null }
    const match = Array.isArray(row.matches) ? row.matches[0] : row.matches
    if (!match || match.status !== 'completed') continue
    const { matches: _matches, ...stat } = row
    rows.push({ stat, match })
  }

  return rows.sort(
    (a, b) => getMatchSortTimestamp(b.match) - getMatchSortTimestamp(a.match),
  )
}

export async function fetchSeasons(): Promise<DbSeason[]> {
  const { data, error } = await supabase
    .from('seasons')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function fetchActiveSeason(): Promise<DbSeason | null> {
  const { data, error } = await supabase
    .from('seasons')
    .select('*')
    .eq('status', 'active')
    .maybeSingle()
  if (error) throw error
  return data
}

export async function createSeason(input: {
  name: string
  startsOn?: string | null
  endsOn?: string | null
}): Promise<DbSeason> {
  const trimmed = input.name.trim()
  if (!trimmed) throw new Error('Season name is required')
  const startsOn = input.startsOn ?? null
  const endsOn = input.endsOn ?? null
  if (startsOn && endsOn && endsOn < startsOn) {
    throw new Error('End month must be on or after the start month')
  }
  const { data, error } = await supabase
    .from('seasons')
    .insert({
      name: trimmed,
      status: 'archived' satisfies SeasonStatus,
      starts_on: startsOn,
      ends_on: endsOn,
    })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateSeason(
  seasonId: string,
  input: {
    name: string
    startsOn?: string | null
    endsOn?: string | null
  },
): Promise<DbSeason> {
  const trimmed = input.name.trim()
  if (!trimmed) throw new Error('Season name is required')
  const startsOn = input.startsOn ?? null
  const endsOn = input.endsOn ?? null
  if (startsOn && endsOn && endsOn < startsOn) {
    throw new Error('End month must be on or after the start month')
  }
  const { data, error } = await supabase
    .from('seasons')
    .update({
      name: trimmed,
      starts_on: startsOn,
      ends_on: endsOn,
    })
    .eq('id', seasonId)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function setActiveSeason(seasonId: string): Promise<DbSeason> {
  const { data, error } = await supabase.rpc('set_active_season', {
    p_season_id: seasonId,
  })
  if (error) throw error
  return data as DbSeason
}

export async function archiveSeason(seasonId: string): Promise<DbSeason> {
  const { data, error } = await supabase
    .from('seasons')
    .update({ status: 'archived' satisfies SeasonStatus })
    .eq('id', seasonId)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function assignPlayerToSeasonRoster(input: {
  seasonId: string
  teamId: string
  playerId: string
  primaryJerseyNumber?: number | null
}): Promise<DbSeasonRoster> {
  const { data, error } = await supabase
    .from('season_rosters')
    .upsert(
      {
        season_id: input.seasonId,
        team_id: input.teamId,
        player_id: input.playerId,
        primary_jersey_number: input.primaryJerseyNumber ?? null,
      },
      { onConflict: 'season_id,team_id,player_id' },
    )
    .select()
    .single()
  if (error) throw error
  return data
}

export async function removePlayerFromSeasonRoster(
  seasonId: string,
  teamId: string,
  playerId: string,
): Promise<void> {
  const { error } = await supabase
    .from('season_rosters')
    .delete()
    .eq('season_id', seasonId)
    .eq('team_id', teamId)
    .eq('player_id', playerId)
  if (error) throw error
}

export async function setPlayerActiveStatus(playerId: string, active: boolean): Promise<DbPlayer> {
  const { data, error } = await supabase
    .from('players')
    .update({ active_status: active })
    .eq('id', playerId)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function insertTeam(input: {
  name: string
  ageGroup: AgeGroup
}): Promise<DbTeam> {
  const trimmed = input.name.trim()
  const format = formatForAgeGroup(input.ageGroup)
  const { data, error } = await supabase
    .from('teams')
    .insert({
      name: trimmed,
      format,
      age_group: input.ageGroup,
      active_status: true,
    })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateTeamFormat(teamId: string, format: string): Promise<DbTeam> {
  const { data, error } = await supabase
    .from('teams')
    .update({ format })
    .eq('id', teamId)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateTeamAgeGroup(
  teamId: string,
  ageGroup: AgeGroup,
): Promise<DbTeam> {
  const { data, error } = await supabase
    .from('teams')
    .update({
      age_group: ageGroup,
      format: formatForAgeGroup(ageGroup),
    })
    .eq('id', teamId)
    .select()
    .single()
  if (error) throw error
  return data
}

/** Director-only: update stored team name + age group (and derived format). */
export async function updateTeamProfile(
  teamId: string,
  input: { name: string; ageGroup: AgeGroup },
): Promise<DbTeam> {
  const name = input.name.trim()
  if (!name) throw new Error('Team name is required')
  const { data, error } = await supabase
    .from('teams')
    .update({
      name,
      age_group: input.ageGroup,
      format: formatForAgeGroup(input.ageGroup),
    })
    .eq('id', teamId)
    .select()
    .single()
  if (error) throw error
  return data
}

/** Director-only: archive a team (soft-delete). Matches and stats are kept. */
export async function setTeamActiveStatus(
  teamId: string,
  active: boolean,
): Promise<DbTeam> {
  const { data, error } = await supabase
    .from('teams')
    .update({ active_status: active })
    .eq('id', teamId)
    .select()
    .single()
  if (error) throw error
  return data
}

/** @deprecated Prefer setTeamActiveStatus(teamId, false). Hard delete is disabled. */
export async function deleteTeam(teamId: string): Promise<void> {
  await setTeamActiveStatus(teamId, false)
}

export async function updateTeamPrimaryCoachName(
  teamId: string,
  primaryCoachName: string,
): Promise<DbTeam> {
  const { data, error } = await supabase
    .from('teams')
    .update({ primary_coach_name: primaryCoachName.trim() })
    .eq('id', teamId)
    .select()
    .single()
  if (error) throw error
  return data
}

export function resolveMatchCoachName(match: DbMatch, coach: DbCoach | null): string {
  const stored = match.coach_name?.trim()
  if (stored) return stored
  return coach?.name?.trim() ?? ''
}

export async function insertCoach(name: string): Promise<DbCoach> {
  const trimmed = name.trim()
  const { data, error } = await supabase.from('coaches').insert({ name: trimmed }).select().single()
  if (error) throw error
  return data
}

export async function findTeamByName(name: string): Promise<DbTeam | null> {
  const { data, error } = await supabase.from('teams').select('*').eq('name', name.trim()).maybeSingle()
  if (error) throw error
  return data
}

export async function findCoachByName(name: string): Promise<DbCoach | null> {
  const { data, error } = await supabase.from('coaches').select('*').eq('name', name.trim()).maybeSingle()
  if (error) throw error
  return data
}

export type TeamCoachingStaff = {
  headCoaches: string[]
  assistants: string[]
}

/** Display names for staff assigned to a team (Head / Assistant). */
export async function fetchTeamCoachingStaff(teamId: string): Promise<TeamCoachingStaff> {
  const { data: members, error: membersError } = await supabase
    .from('team_members')
    .select('user_id, team_role')
    .eq('team_id', teamId)
  if (membersError) throw membersError

  const rows = members ?? []
  if (rows.length === 0) {
    return { headCoaches: [], assistants: [] }
  }

  const userIds = [...new Set(rows.map((row) => row.user_id).filter(Boolean))]
  const [{ data: profiles }, { data: roles }] = await Promise.all([
    supabase.from('profiles').select('id, email, display_name').in('id', userIds),
    supabase.from('user_roles').select('user_id, display_name').in('user_id', userIds),
  ])

  const profileById = new Map((profiles ?? []).map((row) => [row.id, row] as const))
  const roleNameById = new Map(
    (roles ?? []).map((row) => [row.user_id, row.display_name] as const),
  )

  const resolveName = (userId: string): string | null => {
    const profile = profileById.get(userId)
    const fromProfile = profile?.display_name?.trim()
    if (fromProfile) return fromProfile
    const fromRole = roleNameById.get(userId)?.trim()
    if (fromRole) return fromRole
    const email = profile?.email?.trim()
    if (email) return email.split('@')[0] || email
    return null
  }

  const headCoaches: string[] = []
  const assistants: string[] = []
  for (const row of rows) {
    const name = resolveName(row.user_id)
    if (!name) continue
    if (row.team_role === 'head_coach') {
      if (!headCoaches.includes(name)) headCoaches.push(name)
    } else if (row.team_role === 'assistant_coach') {
      if (!assistants.includes(name)) assistants.push(name)
    }
  }

  headCoaches.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
  assistants.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))

  return { headCoaches, assistants }
}

/**
 * Display names for Directors and Staff who coach any team — used in the Game Day
 * coach picker so you can cover for another age group.
 */
export async function fetchClubStaffCoachNames(): Promise<string[]> {
  const [rolesRes, profilesRes, membersRes] = await Promise.all([
    supabase
      .from('user_roles')
      .select('user_id, app_role, display_name')
      .in('app_role', ['director', 'coach']),
    supabase.from('profiles').select('id, email, display_name'),
    supabase.from('team_members').select('user_id'),
  ])

  if (rolesRes.error) throw rolesRes.error
  if (profilesRes.error) throw profilesRes.error
  if (membersRes.error) throw membersRes.error

  const profileById = new Map((profilesRes.data ?? []).map((row) => [row.id, row] as const))
  const memberIds = new Set((membersRes.data ?? []).map((row) => row.user_id))

  const resolveName = (
    userId: string,
    roleDisplayName: string | null | undefined,
  ): string | null => {
    const profile = profileById.get(userId)
    const fromProfile = profile?.display_name?.trim()
    if (fromProfile) return fromProfile
    const fromRole = roleDisplayName?.trim()
    if (fromRole) return fromRole
    const email = profile?.email?.trim()
    if (email) return email.split('@')[0] || email
    return null
  }

  const names = new Set<string>()
  for (const row of rolesRes.data ?? []) {
    const isDirector = row.app_role === 'director'
    const isAssignedCoach = row.app_role === 'coach' && memberIds.has(row.user_id)
    if (!isDirector && !isAssignedCoach) continue
    const name = resolveName(row.user_id, row.display_name)
    if (name) names.add(name)
  }

  // Team members without a coach/director app_role still appear if they have a profile name.
  for (const userId of memberIds) {
    const name = resolveName(userId, null)
    if (name) names.add(name)
  }

  return [...names].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
}

export async function resolveCoachIdForName(name: string): Promise<string | null> {
  const trimmed = name.trim()
  if (!trimmed) return null

  const existing = await findCoachByName(trimmed)
  return existing?.id ?? null
}

export async function upsertPlayer(input: {
  id?: string
  teamId?: string
  seasonId?: string
  ageGroup: AgeGroup
  firstName: string
  lastName: string
  jersey: number | null
  isGuest?: boolean
  position?: string
  primaryPosition?: string
  secondaryPosition?: string
}): Promise<DbPlayer> {
  const firstName = input.firstName.trim()
  const lastName = input.lastName.trim()
  if (!firstName) throw new Error('First name is required')

  const primaryPosition = input.primaryPosition?.trim() || DEFAULT_PRIMARY_POSITION
  const secondaryPosition = input.secondaryPosition?.trim() || DEFAULT_SECONDARY_POSITION
  const legacyPosition = input.position ?? rosterProfilePositionToLegacy(primaryPosition)
  const baseUpdate = {
    first_name: firstName,
    last_name: lastName,
    jersey: input.jersey,
    age_group: input.ageGroup,
    is_guest: input.isGuest ?? false,
    position: legacyPosition,
    active_status: true,
  }

  let player: DbPlayer

  if (input.id) {
    const withProfile = {
      ...baseUpdate,
      primary_position: primaryPosition,
      secondary_position: secondaryPosition,
    }
    const { data, error } = await supabase
      .from('players')
      .update(withProfile)
      .eq('id', input.id)
      .select()
      .single()
    if (error) throw error
    player = data
  } else {
    const withProfile = {
      ...baseUpdate,
      primary_position: primaryPosition,
      secondary_position: secondaryPosition,
    }
    const { data, error } = await supabase.from('players').insert(withProfile).select().single()
    if (error) throw error
    player = data
  }

  if (input.seasonId && input.teamId) {
    await assignPlayerToSeasonRoster({
      seasonId: input.seasonId,
      teamId: input.teamId,
      playerId: player.id,
      primaryJerseyNumber: input.jersey,
    })
  }

  return player
}

export async function createMatchRecord(input: {
  teamId: string
  seasonId: string
  coachId: string | null
  coachName: string
  opponent: string
  locationType: LocationType
  tournamentGame: boolean
  halfLength: number
  matchDate: string
  matchTime: string
  status?: DbMatch['status']
  subIntervalSeconds?: number | null
  gkPlaysFullHalf?: boolean
}): Promise<DbMatch> {
  const coachName = input.coachName.trim() || null
  const matchDate = input.matchDate.trim() || null
  const matchTime =
    input.matchTime.trim().length === 5
      ? `${input.matchTime.trim()}:00`
      : input.matchTime.trim() || null
  const status = input.status ?? 'active'

  const minimalPayload = {
    team_id: input.teamId,
    season_id: input.seasonId,
    coach_id: input.coachId,
    opponent: input.opponent,
    location: input.locationType,
    tournament_game: input.tournamentGame,
    half_length: input.halfLength,
    clock_seconds: input.halfLength * 60,
    date: matchDateTimeIso(input.matchDate, input.matchTime),
    status,
  }

  const optionalFields: Record<string, unknown> = {
    match_date: matchDate,
    match_time: matchTime,
    coach_name: coachName,
    location_type: input.locationType,
    sub_interval_seconds: input.subIntervalSeconds ?? null,
    gk_plays_full_half: input.gkPlaysFullHalf ?? true,
  }

  // Try fullest payload first; retry with fewer optional columns when schema is behind.
  const optionalKeys = [
    'match_date',
    'match_time',
    'coach_name',
    'location_type',
    'sub_interval_seconds',
    'gk_plays_full_half',
  ] as const
  const payloadAttempts: Array<Record<string, unknown>> = []

  for (let mask = (1 << optionalKeys.length) - 1; mask >= 0; mask--) {
    const extras: Record<string, unknown> = {}
    for (let i = 0; i < optionalKeys.length; i++) {
      if (mask & (1 << i)) {
        const key = optionalKeys[i]
        extras[key] = optionalFields[key]
      }
    }
    payloadAttempts.push({ ...minimalPayload, ...extras })
  }

  payloadAttempts.sort(
    (a, b) => countOptionalFields(b, optionalKeys) - countOptionalFields(a, optionalKeys),
  )

  let lastError: unknown = null
  for (const payload of payloadAttempts) {
    const { data, error } = await supabase.from('matches').insert(payload).select().single()
    if (!error) return data
    lastError = error
    if (!isMissingColumnError(error)) break
  }

  if (lastError) throw lastError
  throw new Error('Failed to create match record')
}

function countOptionalFields(
  payload: Record<string, unknown>,
  keys: readonly string[],
): number {
  return keys.filter((key) => key in payload).length
}

/**
 * Deletes a match and all associated child rows.
 * Child tables use ON DELETE CASCADE; we still clear them explicitly first so
 * environments with partial schema still leave no orphans.
 */
export async function deleteMatchRecord(matchId: string) {
  const childTables = [
    'match_events',
    'match_stats',
    'match_reviews',
    'match_stat_trackers',
  ] as const

  for (const table of childTables) {
    const { error } = await supabase.from(table).delete().eq('match_id', matchId)
    if (error && !isMissingRelationError(error)) throw error
  }

  const { error } = await supabase.from('matches').delete().eq('id', matchId)
  if (error) throw error
}

function isMissingRelationError(error: { code?: string; message?: string }): boolean {
  const code = error.code ?? ''
  const message = (error.message ?? '').toLowerCase()
  return (
    code === '42P01' ||
    code === 'PGRST205' ||
    message.includes('does not exist') ||
    message.includes('could not find the table')
  )
}

export async function createScheduledMatchRecord(input: {
  teamId: string
  seasonId: string
  coachId: string | null
  coachName: string
  opponent: string
  locationType: LocationType
  halfLength?: number
  matchDate: string
  matchTime: string
}): Promise<DbMatch> {
  return createMatchRecord({
    teamId: input.teamId,
    seasonId: input.seasonId,
    coachId: input.coachId,
    coachName: input.coachName,
    opponent: input.opponent.trim() || 'Opponent',
    locationType: input.locationType,
    tournamentGame: false,
    halfLength: input.halfLength ?? 30,
    matchDate: input.matchDate,
    matchTime: input.matchTime,
    status: 'scheduled',
  })
}

export async function fetchScheduledMatchesByTeamId(teamId: string): Promise<DbMatch[]> {
  const { data, error } = await supabase
    .from('matches')
    .select('*')
    .eq('team_id', teamId)
    .eq('status', 'scheduled')
    .order('date', { ascending: true })
  if (error) throw error
  return [...(data ?? [])].sort((a, b) => getMatchSortTimestamp(a) - getMatchSortTimestamp(b))
}

export async function createMatchStats(
  matchId: string,
  attendingPlayers: RosterPlayer[],
  firstHalfStarterIds: string[],
  matchPositions: Record<string, string>,
  formation: string,
  absentPlayers: RosterPlayer[] = [],
): Promise<MatchPlayer[]> {
  const firstSet = new Set(firstHalfStarterIds)
  const attendingIds = new Set(attendingPlayers.map((player) => player.id))

  const matchPlayers = [
    ...attendingPlayers.map((player) => {
      const isFirstHalfStarter = firstSet.has(player.id)
      return createMatchPlayer(player, {
        attending: true,
        isFirstHalfStarter,
        isSecondHalfStarter: false,
        isOnField: isFirstHalfStarter,
        matchPosition: matchPositions[player.id] ?? player.position,
      })
    }),
    ...absentPlayers
      .filter((player) => !attendingIds.has(player.id))
      .map((player) =>
        createMatchPlayer(player, {
          attending: false,
          isFirstHalfStarter: false,
          isSecondHalfStarter: false,
          isOnField: false,
          matchPosition: matchPositions[player.id] ?? player.position,
        }),
      ),
  ]

  const rows = matchPlayers.map((p) => matchPlayerToStatPayload(matchId, p))
  if (rows.length > 0) {
    const { error } = await supabase.from('match_stats').insert(rows)
    if (error) throw error
  }

  const starterEvents = matchPlayers
    .filter((p) => p.attending && p.isOnField)
    .map((p) =>
      matchEventToRow({
        matchId,
        playerId: p.id,
        eventType: 'sub_in',
        timestamp: 0,
        formation,
        eventNotes: p.matchPosition,
      }),
    )

  await insertMatchEventRows(starterEvents)

  // Live match state only needs attending players on the pitch/bench.
  return matchPlayers.filter((player) => player.attending)
}

export async function fetchActiveMatch(): Promise<ActiveMatchBundle | null> {
  const { data: match, error: matchError } = await supabase
    .from('matches')
    .select('*')
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (matchError) throw matchError
  if (!match) return null

  const [{ data: team }, { data: coach }, { data: stats }] = await Promise.all([
    supabase.from('teams').select('*').eq('id', match.team_id).single(),
    match.coach_id
      ? supabase.from('coaches').select('*').eq('id', match.coach_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabase.from('match_stats').select('*').eq('match_id', match.id),
  ])

  if (!team || !stats) return null

  return { match, team, coach: coach ?? null, stats }
}

export async function updateMatchRecord(
  matchId: string,
  patch: Partial<
    Pick<
      DbMatch,
      | 'home_score'
      | 'away_score'
      | 'clock_seconds'
      | 'period'
      | 'period_clock_started'
      | 'status'
    >
  >,
) {
  const { error } = await supabase.from('matches').update(patch).eq('id', matchId)
  if (error) throw error
}

export async function upsertMatchStat(matchId: string, player: MatchPlayer) {
  const payload = matchPlayerToStatPayload(matchId, player)
  const { error } = await supabase.from('match_stats').upsert(payload, {
    onConflict: 'match_id,player_id',
  })
  if (error) throw error
}

export async function upsertMatchStats(matchId: string, players: MatchPlayer[]) {
  const rows = players.map((p) => matchPlayerToStatPayload(matchId, p))
  const { error } = await supabase.from('match_stats').upsert(rows, {
    onConflict: 'match_id,player_id',
  })
  if (error) throw error
}

export async function insertMatchEvent(input: MatchEventInput) {
  const playerOptional =
    input.eventType === 'opponent_goal' ||
    input.eventType === 'formation_change' ||
    input.eventType === 'stat_team_log'
  if (!playerOptional && !input.playerId) {
    throw new Error('playerId is required for this event type')
  }
  await insertMatchEventRows([matchEventToRow(input)])
}

export async function insertMatchEvents(events: MatchEventInput[]) {
  if (events.length === 0) return
  for (const event of events) {
    const playerOptional =
      event.eventType === 'opponent_goal' ||
      event.eventType === 'formation_change' ||
      event.eventType === 'stat_team_log'
    if (!playerOptional && !event.playerId) {
      throw new Error('playerId is required for this event type')
    }
  }
  await insertMatchEventRows(events.map((event) => matchEventToRow(event)))
}

export async function fetchMatchById(matchId: string): Promise<DbMatch | null> {
  const { data, error } = await supabase.from('matches').select('*').eq('id', matchId).maybeSingle()
  if (error) throw error
  return data
}

export async function saveInternalCoachNotes(matchId: string, internalCoachNotes: string) {
  const notes = internalCoachNotes.trim() || null
  const { error } = await supabase
    .from('matches')
    .update({ internal_coach_notes: notes })
    .eq('id', matchId)
  if (!error) return
  if (isMissingColumnError(error)) {
    console.warn(
      '[saveInternalCoachNotes] internal_coach_notes unavailable:',
      formatSupabaseError(error),
    )
    return
  }
  throw error
}

/** @deprecated Use saveInternalCoachNotes */
export async function saveCoachMatchSummary(matchId: string, coachSummaryNotes: string) {
  return saveInternalCoachNotes(matchId, coachSummaryNotes)
}

export async function saveParentFacingRecap(matchId: string, parentFacingRecap: string) {
  const notes = parentFacingRecap.trim() || null
  const { error } = await supabase
    .from('matches')
    .update({ parent_facing_recap: notes })
    .eq('id', matchId)
  if (!error) return
  if (isMissingColumnError(error)) {
    console.warn(
      '[saveParentFacingRecap] parent_facing_recap unavailable:',
      formatSupabaseError(error),
    )
    return
  }
  throw error
}

export async function saveQualitativeContext(
  matchId: string,
  context: Record<string, unknown> | null,
) {
  const { error } = await supabase
    .from('matches')
    .update({ qualitative_context: context })
    .eq('id', matchId)

  if (!error) return

  if (isMissingColumnError(error)) {
    console.warn(
      '[saveQualitativeContext] qualitative_context unavailable:',
      formatSupabaseError(error),
    )
    return
  }

  throw error
}

/** Merge timing fields into existing qualitative_context without wiping coaching answers. */
export async function mergeMatchTimingContext(
  matchId: string,
  timing: { addedTimeSeconds?: number; endedOnTime?: boolean | null },
) {
  const existing = await fetchMatchById(matchId)
  const current = parseQualitativeContext(existing?.qualitative_context)
  const next: QualitativeContext = {
    ...current,
    addedTimeSeconds:
      timing.addedTimeSeconds !== undefined
        ? Math.max(0, Math.floor(timing.addedTimeSeconds))
        : current.addedTimeSeconds,
    endedOnTime:
      timing.endedOnTime !== undefined ? timing.endedOnTime : current.endedOnTime,
  }
  await saveQualitativeContext(matchId, serializeQualitativeContext(next))
}

export async function markMatchPendingReview(matchId: string) {
  const { error } = await supabase
    .from('matches')
    .update({ status: 'pending_review' })
    .eq('id', matchId)
  if (error) throw error
}

export async function completeMatch(matchId: string) {
  const { error } = await supabase
    .from('matches')
    .update({ status: 'completed' })
    .eq('id', matchId)
  if (error) throw error
}

export async function persistMatchPlusMinusFromEvents(matchId: string) {
  const [match, events, stats] = await Promise.all([
    fetchMatchById(matchId),
    fetchMatchEvents(matchId),
    fetchMatchStatsByMatchId(matchId),
  ])
  if (!match) return

  const firstHalfStarterIds = stats
    .filter((row) => row.is_first_half_starter)
    .map((row) => row.player_id)
  const ledger = computeMatchPlusMinus(events, match.half_length * 60, { firstHalfStarterIds })

  const updates = stats
    .filter((row) => row.attending)
    .map((row) =>
      supabase
        .from('match_stats')
        .update({ plus_minus: ledger.get(row.player_id) ?? 0 })
        .eq('match_id', matchId)
        .eq('player_id', row.player_id),
    )

  const results = await Promise.all(updates)
  const firstError = results.find((result) => result.error)?.error
  if (firstError && !isMissingColumnError(firstError)) {
    throw firstError
  }
}

export async function finalizeMatchReview(matchId: string) {
  await persistMatchPlusMinusFromEvents(matchId)
  await completeMatch(matchId)
}

export async function fetchPendingReviewMatchesByTeamId(teamId: string): Promise<DbMatch[]> {
  const { data, error } = await supabase
    .from('matches')
    .select('*')
    .eq('team_id', teamId)
    .eq('status', 'pending_review')
    .order('date', { ascending: false })
  if (error) throw error
  return [...(data ?? [])].sort((a, b) => getMatchSortTimestamp(b) - getMatchSortTimestamp(a))
}

export async function fetchMatchRecapBundle(matchId: string): Promise<ActiveMatchBundle | null> {
  const { data: match, error: matchError } = await supabase
    .from('matches')
    .select('*')
    .eq('id', matchId)
    .maybeSingle()

  if (matchError) throw matchError
  if (!match) return null

  const [{ data: team }, { data: coach }, { data: stats }] = await Promise.all([
    supabase.from('teams').select('*').eq('id', match.team_id).single(),
    match.coach_id
      ? supabase.from('coaches').select('*').eq('id', match.coach_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabase.from('match_stats').select('*').eq('match_id', match.id),
  ])

  if (!team || !stats) return null

  return { match, team, coach: coach ?? null, stats }
}

export async function fetchRecapEligibleMatchesByTeamId(teamId: string): Promise<DbMatch[]> {
  const { data, error } = await supabase
    .from('matches')
    .select('*')
    .eq('team_id', teamId)
    .in('status', ['pending_review', 'completed'])
    .order('date', { ascending: false })
  if (error) throw error
  return [...(data ?? [])].sort((a, b) => getMatchSortTimestamp(b) - getMatchSortTimestamp(a))
}

export async function fetchCompletedMatchesByTeamId(teamId: string): Promise<DbMatch[]> {
  const { data, error } = await supabase
    .from('matches')
    .select('*')
    .eq('team_id', teamId)
    .eq('status', 'completed')
    .order('date', { ascending: false })
  if (error) throw error
  return [...(data ?? [])].sort((a, b) => getMatchSortTimestamp(b) - getMatchSortTimestamp(a))
}

export async function fetchMatchStatsByMatchId(matchId: string): Promise<DbMatchStat[]> {
  const { data, error } = await supabase
    .from('match_stats')
    .select('*')
    .eq('match_id', matchId)
  if (error) throw error
  return data ?? []
}

export async function fetchMatchEvents(matchId: string): Promise<DbMatchEvent[]> {
  const { data, error } = await supabase
    .from('match_events')
    .select('*')
    .eq('match_id', matchId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return data ?? []
}

export async function fetchMatchReviews(matchId: string): Promise<DbMatchReview[]> {
  const { data, error } = await supabase
    .from('match_reviews')
    .select('*')
    .eq('match_id', matchId)
  if (!error) return data ?? []
  if (isOptionalTableError(error)) {
    console.warn('[fetchMatchReviews] match_reviews unavailable:', formatSupabaseError(error))
    return []
  }
  throw error
}

export type PostGameReviewInput = {
  playerId: string
  position: string
  impact: Impact
  notes: string
}

export async function savePostGameReview(
  matchId: string,
  reviews: PostGameReviewInput[],
  internalCoachNotes?: string,
  qualitativeContext?: Record<string, unknown> | null,
) {
  await saveInternalCoachNotes(matchId, internalCoachNotes ?? '')
  await saveQualitativeContext(matchId, qualitativeContext ?? null)

  if (reviews.length === 0) return

  const now = new Date().toISOString()
  const reviewRows = reviews.map((review) => ({
    match_id: matchId,
    player_id: review.playerId,
    position: normalizeRecapPosition(review.position.trim() || 'Overall'),
    impact_score: impactToScore(review.impact),
    review_notes: review.notes.trim() || null,
    updated_at: now,
  }))

  const { error: reviewError } = await supabase
    .from('match_reviews')
    .upsert(reviewRows, { onConflict: 'match_id,player_id,position' })
  if (reviewError && !isOptionalTableError(reviewError) && !isMissingColumnError(reviewError)) {
    throw reviewError
  }
  if (reviewError) {
    if (isMissingColumnError(reviewError)) {
      const legacyRows = reviews.map((review) => ({
        match_id: matchId,
        player_id: review.playerId,
        impact_score: impactToScore(review.impact),
        review_notes: review.notes.trim() || null,
        updated_at: now,
      }))
      const { error: legacyError } = await supabase
        .from('match_reviews')
        .upsert(legacyRows, { onConflict: 'match_id,player_id' })
      if (legacyError && !isOptionalTableError(legacyError)) throw legacyError
    } else {
      console.warn('[savePostGameReview] match_reviews unavailable:', formatSupabaseError(reviewError))
    }
  }

  const primaryImpactByPlayer = new Map<string, Impact>()
  for (const review of reviews) {
    if (normalizeRecapPosition(review.position) !== 'Overall') continue
    primaryImpactByPlayer.set(review.playerId, review.impact)
  }
  for (const review of reviews) {
    if (primaryImpactByPlayer.has(review.playerId)) continue
    primaryImpactByPlayer.set(review.playerId, review.impact)
  }

  await Promise.all(
    [...primaryImpactByPlayer.entries()].map(([playerId, impact]) =>
      supabase
        .from('match_stats')
        .update({ impact_score: impactToScore(impact) })
        .eq('match_id', matchId)
        .eq('player_id', playerId),
    ),
  )
}

/** Fire-and-forget background sync helpers */
export function syncMatchRecord(
  matchId: string,
  patch: Parameters<typeof updateMatchRecord>[1],
) {
  void updateMatchRecord(matchId, patch).catch((e) => logSyncError('updateMatchRecord', e))
}

export function syncMatchStat(matchId: string, player: MatchPlayer) {
  void upsertMatchStat(matchId, player).catch((e) => logSyncError('upsertMatchStat', e))
}

export function syncMatchStats(matchId: string, players: MatchPlayer[]) {
  void upsertMatchStats(matchId, players).catch((e) => logSyncError('upsertMatchStats', e))
}

export function syncMatchEvent(input: Parameters<typeof insertMatchEvent>[0]) {
  void insertMatchEvent(input).catch((e) => logSyncError('insertMatchEvent', e))
}

export function syncMatchEvents(events: Parameters<typeof insertMatchEvents>[0]) {
  void insertMatchEvents(events).catch((e) => logSyncError('insertMatchEvents', e))
}

export function syncMarkMatchPendingReview(matchId: string) {
  void markMatchPendingReview(matchId).catch((e) => logSyncError('markMatchPendingReview', e))
}

export function syncCompleteMatch(matchId: string) {
  void completeMatch(matchId).catch((e) => logSyncError('completeMatch', e))
}

export function rebuildMatchPlayers(
  roster: RosterPlayer[],
  stats: DbMatchStat[],
): MatchPlayer[] {
  const rosterById = new Map(roster.map((p) => [p.id, p]))
  return stats
    .map((stat) => {
      const base = rosterById.get(stat.player_id)
      if (!base) return null
      return statToMatchPlayer(base, stat)
    })
    .filter((p): p is MatchPlayer => p !== null)
}

export type MatchClockPatch = {
  homeScore: number
  awayScore: number
  seconds: number
  period: MatchPeriod
  periodClockStarted: boolean
}

export function syncMatchClock(matchId: string, clock: MatchClockPatch) {
  const clockSeconds = persistableClockSeconds(clock.seconds)
  const added = addedTimeSeconds(clock.seconds)
  syncMatchRecord(matchId, {
    home_score: clock.homeScore,
    away_score: clock.awayScore,
    clock_seconds: clockSeconds,
    period: clock.period,
    period_clock_started: clock.periodClockStarted,
  })
  // Persist OT separately so resume can rebuild negative remaining without schema change.
  void mergeMatchTimingContext(matchId, { addedTimeSeconds: added }).catch((e) =>
    logSyncError('mergeMatchTimingContext', e),
  )
}

function isOptionalLineupPresetsError(err: unknown): boolean {
  const message = formatSupabaseError(err).toLowerCase()
  return (
    message.includes('lineup_presets') &&
    (message.includes('does not exist') ||
      message.includes('could not find') ||
      message.includes('schema cache') ||
      message.includes('permission denied'))
  )
}

export async function fetchLineupPresetsByTeamId(teamId: string): Promise<DbLineupPreset[]> {
  const { data, error } = await supabase
    .from('lineup_presets')
    .select('*')
    .eq('team_id', teamId)
    .order('preset_name', { ascending: true })
  if (!error) return data ?? []
  if (isOptionalLineupPresetsError(error)) {
    console.warn('[fetchLineupPresetsByTeamId] lineup_presets unavailable:', formatSupabaseError(error))
    return []
  }
  throw error
}

export async function insertLineupPreset(input: {
  teamId: string
  presetName: string
  formationJson: LineupPresetFormationJson
}): Promise<DbLineupPreset> {
  const now = new Date().toISOString()
  const { data, error } = await supabase
    .from('lineup_presets')
    .insert({
      team_id: input.teamId,
      preset_name: input.presetName.trim(),
      formation_json: input.formationJson,
      updated_at: now,
    })
    .select('*')
    .single()
  if (error) throw error
  return data
}

export async function updateLineupPreset(
  presetId: string,
  input: { presetName: string; formationJson: LineupPresetFormationJson },
): Promise<DbLineupPreset> {
  const now = new Date().toISOString()
  const { data, error } = await supabase
    .from('lineup_presets')
    .update({
      preset_name: input.presetName.trim(),
      formation_json: input.formationJson,
      updated_at: now,
    })
    .eq('id', presetId)
    .select('*')
    .single()
  if (error) throw error
  return data
}

export async function deleteLineupPreset(presetId: string): Promise<void> {
  const { error } = await supabase.from('lineup_presets').delete().eq('id', presetId)
  if (error) throw error
}

export type StatTrackerContext = {
  match: DbMatch
  teamName: string
  roster: StatTrackerRosterPlayer[]
}

function isMissingStatTrackerTableError(err: unknown): boolean {
  const message = formatSupabaseError(err).toLowerCase()
  return (
    message.includes('match_stat_trackers') &&
    (message.includes('does not exist') ||
      message.includes('could not find') ||
      message.includes('schema cache') ||
      message.includes('not found'))
  )
}

async function findMatchForStatTracker(matchId: string, token: string): Promise<DbMatch | null> {
  const normalizedToken = normalizeStatTrackerToken(token)
  if (!normalizedToken) return null

  const match = await fetchMatchById(matchId)
  if (match?.stat_tracker_token) {
    const stored = normalizeStatTrackerToken(match.stat_tracker_token)
    if (stored === normalizedToken) return match
  }

  const { data: matchedRow, error: matchError } = await supabase
    .from('matches')
    .select('*')
    .eq('id', matchId)
    .eq('stat_tracker_token', normalizedToken)
    .maybeSingle()

  if (!matchError && matchedRow) return matchedRow

  if (matchError && !isMissingColumnError(matchError)) {
    throw matchError
  }

  const { data: legacyRow, error: legacyError } = await supabase
    .from('match_stat_trackers')
    .select('match_id')
    .eq('match_id', matchId)
    .eq('token', normalizedToken)
    .is('revoked_at', null)
    .maybeSingle()

  if (legacyError && !isMissingStatTrackerTableError(legacyError)) {
    throw legacyError
  }
  if (!legacyRow) return null

  return fetchMatchById(matchId)
}

async function fetchStoredStatTrackerToken(matchId: string): Promise<string | null> {
  const { data: matchRow, error: matchError } = await supabase
    .from('matches')
    .select('stat_tracker_token')
    .eq('id', matchId)
    .maybeSingle()

  if (!matchError && matchRow?.stat_tracker_token?.trim()) {
    return matchRow.stat_tracker_token.trim()
  }

  if (matchError && !isMissingColumnError(matchError)) {
    throw matchError
  }

  const { data: trackerRow, error: trackerError } = await supabase
    .from('match_stat_trackers')
    .select('token')
    .eq('match_id', matchId)
    .is('revoked_at', null)
    .maybeSingle()

  if (trackerError) {
    if (isMissingStatTrackerTableError(trackerError)) return null
    throw trackerError
  }

  return trackerRow?.token?.trim() ?? null
}

async function persistStatTrackerToken(matchId: string, token: string): Promise<void> {
  const { error: matchError } = await supabase
    .from('matches')
    .update({ stat_tracker_token: token })
    .eq('id', matchId)

  if (!matchError) return

  if (!isMissingColumnError(matchError)) {
    throw matchError
  }

  const { error: trackerError } = await supabase.from('match_stat_trackers').upsert(
    {
      match_id: matchId,
      token,
      revoked_at: null,
    },
    { onConflict: 'match_id' },
  )

  if (trackerError) {
    if (isMissingStatTrackerTableError(trackerError)) {
      throw new Error(
        'Stat tracker is not set up yet. Run supabase-match-stat-tracker-migration.sql in the Supabase SQL Editor.',
      )
    }
    throw trackerError
  }
}

export async function validateStatTrackerToken(matchId: string, token: string): Promise<boolean> {
  const match = await findMatchForStatTracker(matchId, token)
  return match !== null
}

export async function ensureStatTrackerToken(matchId: string): Promise<string> {
  const match = await fetchMatchById(matchId)
  if (!match) {
    throw new Error('Match not found.')
  }

  const existingToken = await fetchStoredStatTrackerToken(matchId)
  if (existingToken) {
    await persistStatTrackerToken(matchId, existingToken)
    return existingToken
  }

  const token = generateStatTrackerToken()
  await persistStatTrackerToken(matchId, token)

  const verified = await findMatchForStatTracker(matchId, token)
  if (verified) return token

  const stored = await fetchStoredStatTrackerToken(matchId)
  if (stored && normalizeStatTrackerToken(stored) === normalizeStatTrackerToken(token)) {
    return stored
  }

  throw new Error(
    'Stat tracker token could not be verified after saving. Reload the Supabase API schema cache (Project Settings → API → Reload schema), then try Share Stat Tracker again.',
  )
}

export async function fetchStatTrackerContext(
  matchId: string,
  token: string,
): Promise<StatTrackerContext | null> {
  const match = await findMatchForStatTracker(matchId, token)
  if (!match) {
    const anyToken = await fetchStoredStatTrackerToken(matchId)
    if (!anyToken) {
      throw new Error(
        'No stat tracker link exists for this match yet. Ask the coach to tap Share Stat Tracker from the live match screen.',
      )
    }
    throw new Error(
      'This stat tracker link is invalid or outdated. Ask the coach to share a fresh link from the live match screen.',
    )
  }

  const [{ data: team, error: teamError }, stats] = await Promise.all([
    supabase.from('teams').select('name').eq('id', match.team_id).maybeSingle(),
    fetchMatchStatsByMatchId(matchId),
  ])

  if (teamError) throw teamError

  const attendingIds = [...new Set(stats.filter((row) => row.attending).map((row) => row.player_id))]
  let players: Array<Pick<DbPlayer, 'id' | 'first_name' | 'last_name' | 'jersey'>> = []
  if (attendingIds.length > 0) {
    const { data, error: playersError } = await supabase
      .from('players')
      .select('id, first_name, last_name, jersey')
      .in('id', attendingIds)
    if (playersError) throw playersError
    players = data ?? []
  }

  const roster = players
    .map((player) => rosterPlayerFromDb(player))
    .sort((a, b) => (a.number ?? 999) - (b.number ?? 999))

  return {
    match,
    teamName: team?.name ?? 'Team',
    roster,
  }
}

export async function insertStatTrackerEvent(input: {
  matchId: string
  token: string
  playerId?: string | null
  eventType: StatTrackerEventType
  timestamp: number
  anonymous?: boolean
}) {
  const isTeamLog = Boolean(input.anonymous || !input.playerId)
  const { error } = await supabase.rpc('log_stat_tracker_event', {
    p_match_id: input.matchId,
    p_token: input.token,
    p_event_type: isTeamLog ? 'stat_team_log' : input.eventType,
    p_timestamp: input.timestamp,
    p_player_id: isTeamLog ? null : input.playerId,
    p_event_notes: isTeamLog ? input.eventType : 'stat_tracker',
  })
  if (error) throw error
}

export type ClubAdminTeamAssignment = {
  teamId: string
  teamRole: TeamRole
}

export type ClubAdminUserRow = {
  id: string
  email: string | null
  displayName: string | null
  appRole: AppRole
  teamAssignments: ClubAdminTeamAssignment[]
}

export async function fetchClubAdminUsers(): Promise<ClubAdminUserRow[]> {
  const [profilesRes, rolesRes, membersRes] = await Promise.all([
    supabase.from('profiles').select('id, email, display_name').order('email'),
    supabase.from('user_roles').select('user_id, app_role, display_name'),
    supabase.from('team_members').select('user_id, team_id, team_role'),
  ])

  if (profilesRes.error) throw profilesRes.error
  if (rolesRes.error) throw rolesRes.error
  if (membersRes.error) throw membersRes.error

  const roleByUser = new Map(
    (rolesRes.data ?? []).map((row) => [row.user_id, row] as const),
  )
  const teamsByUser = new Map<string, ClubAdminTeamAssignment[]>()
  for (const row of membersRes.data ?? []) {
    const list = teamsByUser.get(row.user_id) ?? []
    const teamRole = isTeamRole(row.team_role) ? row.team_role : 'assistant_coach'
    list.push({ teamId: row.team_id, teamRole })
    teamsByUser.set(row.user_id, list)
  }

  return (profilesRes.data ?? []).map((profile) => {
    const roleRow = roleByUser.get(profile.id)
    const roleValue = roleRow?.app_role
    return {
      id: profile.id,
      email: profile.email,
      displayName: profile.display_name ?? roleRow?.display_name ?? null,
      appRole: isAppRole(roleValue) ? roleValue : 'pending',
      teamAssignments: teamsByUser.get(profile.id) ?? [],
    }
  })
}

export async function updateClubUserAppRole(
  userId: string,
  appRole: AssignableAppRole | 'pending',
): Promise<void> {
  const { error } = await supabase
    .from('user_roles')
    .update({ app_role: appRole, updated_at: new Date().toISOString() })
    .eq('user_id', userId)
  if (error) throw error
}

/** @deprecated Use updateClubUserAppRole */
export async function updateClubUserRole(
  userId: string,
  role: AssignableAppRole | 'pending',
): Promise<void> {
  return updateClubUserAppRole(userId, role)
}

export async function replaceClubUserTeams(
  userId: string,
  assignments: ClubAdminTeamAssignment[],
): Promise<void> {
  const { error: deleteError } = await supabase
    .from('team_members')
    .delete()
    .eq('user_id', userId)
  if (deleteError) throw deleteError

  const unique = new Map<string, TeamRole>()
  for (const row of assignments) {
    if (!row.teamId || !isTeamRole(row.teamRole)) continue
    unique.set(row.teamId, row.teamRole)
  }
  if (unique.size === 0) return

  const { error: insertError } = await supabase.from('team_members').insert(
    [...unique.entries()].map(([teamId, teamRole]) => ({
      user_id: userId,
      team_id: teamId,
      team_role: teamRole,
    })),
  )
  if (insertError) throw insertError
}

export async function revokeClubUserAccess(userId: string): Promise<void> {
  await replaceClubUserTeams(userId, [])
  await updateClubUserAppRole(userId, 'pending')
}

export type StaffInviteRow = {
  id: string
  email: string
  displayName: string | null
  appRole: AssignableAppRole
  teamAssignments: ClubAdminTeamAssignment[]
  status: 'pending' | 'accepted' | 'cancelled'
  createdAt: string
}

export type CreateStaffInviteResult = {
  status: 'invited' | 'updated_existing'
  inviteId: string
  email: string
  userId?: string
}

export async function fetchPendingStaffInvites(): Promise<StaffInviteRow[]> {
  const { data, error } = await supabase
    .from('staff_invites')
    .select(
      'id, email, display_name, app_role, team_ids, team_roles, default_team_role, status, created_at',
    )
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
  if (error) throw error

  return (data ?? []).flatMap((row) => {
    if (!isAssignableAppRole(row.app_role)) return []
    const teamIds = row.team_ids ?? []
    const teamRoles = row.team_roles ?? []
    const fallback = isTeamRole(row.default_team_role)
      ? row.default_team_role
      : 'assistant_coach'
    const teamAssignments: ClubAdminTeamAssignment[] = teamIds.map(
      (teamId: string, index: number) => ({
        teamId,
        teamRole: isTeamRole(teamRoles[index]) ? teamRoles[index]! : fallback,
      }),
    )
    return [
      {
        id: row.id,
        email: row.email,
        displayName: row.display_name,
        appRole: row.app_role,
        teamAssignments,
        status: 'pending' as const,
        createdAt: row.created_at,
      },
    ]
  })
}

export async function createStaffInvite(input: {
  email: string
  appRole: AssignableAppRole
  teamAssignments: ClubAdminTeamAssignment[]
  displayName?: string
}): Promise<CreateStaffInviteResult> {
  const email = input.email.trim().toLowerCase()
  const displayName = input.displayName?.trim() || undefined
  const teamIds = input.teamAssignments.map((a) => a.teamId)
  const teamRoles = input.teamAssignments.map((a) => a.teamRole)
  const defaultTeamRole = teamRoles[0] ?? 'assistant_coach'

  const { data, error } = await supabase.rpc('create_staff_invite', {
    p_email: email,
    p_app_role: input.appRole,
    p_team_ids: teamIds,
    p_display_name: displayName ?? null,
    p_default_team_role: defaultTeamRole,
    p_team_roles: teamRoles,
  })
  if (error) throw error

  const payload = data as {
    status?: string
    invite_id?: string
    email?: string
    user_id?: string
  } | null

  if (!payload?.invite_id || !payload.email) {
    throw new Error('Invite did not return expected data')
  }

  const { error: otpError } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: true,
      emailRedirectTo: getAuthRedirectUrl(),
      data: displayName ? { display_name: displayName } : undefined,
    },
  })
  if (otpError) {
    throw new Error(
      `Invite saved, but the login email failed to send: ${otpError.message}`,
    )
  }

  return {
    status: payload.status === 'updated_existing' ? 'updated_existing' : 'invited',
    inviteId: payload.invite_id,
    email: payload.email,
    userId: payload.user_id,
  }
}

export async function cancelStaffInvite(inviteId: string): Promise<void> {
  const { error } = await supabase.rpc('cancel_staff_invite', {
    p_invite_id: inviteId,
  })
  if (error) throw error
}

