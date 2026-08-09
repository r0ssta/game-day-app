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
import { createMatchPlayer } from '@/lib/play-time'
import { computeMatchPlusMinus } from '@/lib/plus-minus'
import { getMatchSortTimestamp, matchDateTimeIso } from '@/lib/match-schedule'
import type { LocationType } from '@/lib/match-location'
import { generateStatTrackerToken, normalizeStatTrackerToken, type StatTrackerEventType, type StatTrackerRosterPlayer, rosterPlayerFromDb } from '@/lib/stat-tracker'
import type { DbCoach, DbLineupPreset, DbMatch, DbMatchEvent, DbMatchReview, DbMatchStat, DbPlayer, DbTeam } from '@/types/database'
import type { LineupPresetFormationJson } from '@/lib/lineup-presets'
import type { Impact, MatchPeriod, MatchPlayer, RosterPlayer } from '@/types/match'

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

export function dbPlayerToRoster(player: DbPlayer): RosterPlayer {
  const primaryPosition = player.primary_position ?? legacyPositionToProfile(player.position)
  const secondaryPosition = player.secondary_position ?? primaryPosition
  const { firstName, lastName } = resolvePlayerNameFields(player)

  return {
    id: player.id,
    teamId: player.team_id,
    number: player.jersey,
    firstName,
    lastName,
    position: player.position,
    primaryPosition,
    secondaryPosition,
    isGuest: player.is_guest,
    activeStatus: player.active_status,
  }
}

export function statToMatchPlayer(roster: RosterPlayer, stat: DbMatchStat): MatchPlayer {
  return {
    ...roster,
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
  }
}

function logSyncError(label: string, error: unknown) {
  console.error(`[supabase] ${label}`, error)
}

export async function fetchTeams(): Promise<DbTeam[]> {
  const { data, error } = await supabase.from('teams').select('*').order('name')
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
  options?: { includeInactive?: boolean },
): Promise<DbPlayer[]> {
  let query = supabase.from('players').select('*').eq('team_id', teamId)
  if (!options?.includeInactive) {
    query = query.eq('active_status', true)
  }
  const { data, error } = await query.order('jersey')
  if (error) throw error
  return data ?? []
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

export async function insertTeam(name: string): Promise<DbTeam> {
  const trimmed = name.trim()
  const { data, error } = await supabase
    .from('teams')
    .insert({ name: trimmed, format: '9v9' })
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

export async function resolveCoachIdForName(name: string): Promise<string | null> {
  const trimmed = name.trim()
  if (!trimmed) return null

  const existing = await findCoachByName(trimmed)
  if (existing) return existing.id

  try {
    const created = await insertCoach(trimmed)
    return created.id
  } catch {
    const retry = await findCoachByName(trimmed)
    return retry?.id ?? null
  }
}

export async function upsertPlayer(input: {
  id?: string
  teamId: string
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
    is_guest: input.isGuest ?? false,
    position: legacyPosition,
    active_status: true,
  }

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
    if (!error) return data

    if (isMissingColumnError(error)) {
      const { data: legacyData, error: legacyError } = await supabase
        .from('players')
        .update(baseUpdate)
        .eq('id', input.id)
        .select()
        .single()
      if (legacyError) throw legacyError
      return legacyData
    }
    throw error
  }

  const withProfile = {
    team_id: input.teamId,
    ...baseUpdate,
    primary_position: primaryPosition,
    secondary_position: secondaryPosition,
  }
  const { data, error } = await supabase.from('players').insert(withProfile).select().single()
  if (!error) return data

  if (isMissingColumnError(error)) {
    const { data: legacyData, error: legacyError } = await supabase
      .from('players')
      .insert({
        team_id: input.teamId,
        ...baseUpdate,
      })
      .select()
      .single()
    if (legacyError) throw legacyError
    return legacyData
  }
  throw error
}

export async function createMatchRecord(input: {
  teamId: string
  coachId: string | null
  coachName: string
  opponent: string
  locationType: LocationType
  tournamentGame: boolean
  halfLength: number
  matchDate: string
  matchTime: string
}): Promise<DbMatch> {
  const coachName = input.coachName.trim() || null
  const matchDate = input.matchDate.trim() || null
  const matchTime =
    input.matchTime.trim().length === 5
      ? `${input.matchTime.trim()}:00`
      : input.matchTime.trim() || null

  const minimalPayload = {
    team_id: input.teamId,
    coach_id: input.coachId,
    opponent: input.opponent,
    location: input.locationType,
    tournament_game: input.tournamentGame,
    half_length: input.halfLength,
    clock_seconds: input.halfLength * 60,
    date: matchDateTimeIso(input.matchDate, input.matchTime),
    status: 'active' as const,
  }

  const optionalFields: Record<string, unknown> = {
    match_date: matchDate,
    match_time: matchTime,
    coach_name: coachName,
    location_type: input.locationType,
  }

  // Try fullest payload first; retry with fewer optional columns when schema is behind.
  const optionalKeys = ['match_date', 'match_time', 'coach_name', 'location_type'] as const
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

export async function deleteMatchRecord(matchId: string) {
  const { error } = await supabase.from('matches').delete().eq('id', matchId)
  if (error) throw error
}

export async function createMatchStats(
  matchId: string,
  attendingPlayers: RosterPlayer[],
  firstHalfStarterIds: string[],
  matchPositions: Record<string, string>,
  formation: string,
): Promise<MatchPlayer[]> {
  const firstSet = new Set(firstHalfStarterIds)

  const matchPlayers = attendingPlayers.map((player) => {
    const isFirstHalfStarter = firstSet.has(player.id)
    return createMatchPlayer(player, {
      attending: true,
      isFirstHalfStarter,
      isSecondHalfStarter: false,
      isOnField: isFirstHalfStarter,
      matchPosition: matchPositions[player.id] ?? player.position,
    })
  })

  const rows = matchPlayers.map((p) => matchPlayerToStatPayload(matchId, p))
  if (rows.length > 0) {
    const { error } = await supabase.from('match_stats').insert(rows)
    if (error) throw error
  }

  const starterEvents = matchPlayers
    .filter((p) => p.isOnField)
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

  return matchPlayers
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

export async function saveCoachMatchSummary(matchId: string, coachSummaryNotes: string) {
  const notes = coachSummaryNotes.trim() || null
  const { error } = await supabase
    .from('matches')
    .update({ coach_summary_notes: notes })
    .eq('id', matchId)
  if (!error) return
  if (isMissingColumnError(error)) {
    console.warn('[saveCoachMatchSummary] coach_summary_notes unavailable:', formatSupabaseError(error))
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
  coachSummaryNotes?: string,
  qualitativeContext?: Record<string, unknown> | null,
) {
  await saveCoachMatchSummary(matchId, coachSummaryNotes ?? '')
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
  syncMatchRecord(matchId, {
    home_score: clock.homeScore,
    away_score: clock.awayScore,
    clock_seconds: clock.seconds,
    period: clock.period,
    period_clock_started: clock.periodClockStarted,
  })
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

  const [{ data: team, error: teamError }, stats, { data: players, error: playersError }] =
    await Promise.all([
      supabase.from('teams').select('name').eq('id', match.team_id).maybeSingle(),
      fetchMatchStatsByMatchId(matchId),
      supabase.from('players').select('id, first_name, last_name, jersey').eq('team_id', match.team_id),
    ])

  if (teamError) throw teamError
  if (playersError) throw playersError

  const attendingIds = new Set(
    stats.filter((row) => row.attending).map((row) => row.player_id),
  )

  const roster = (players ?? [])
    .filter((player) => attendingIds.has(player.id))
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
  const valid = await validateStatTrackerToken(input.matchId, input.token)
  if (!valid) {
    throw new Error('Invalid or expired stat tracker link.')
  }

  const match = await fetchMatchById(input.matchId)
  if (!match) {
    throw new Error('Match not found.')
  }
  if (match.status !== 'active') {
    throw new Error('This match is no longer accepting sideline stats.')
  }

  if (input.anonymous || !input.playerId) {
    await insertMatchEvent({
      matchId: input.matchId,
      playerId: null,
      eventType: 'stat_team_log',
      timestamp: input.timestamp,
      formation: '',
      eventNotes: input.eventType,
    })
    return
  }

  await insertMatchEvent({
    matchId: input.matchId,
    playerId: input.playerId,
    eventType: input.eventType,
    timestamp: input.timestamp,
    formation: '',
    eventNotes: 'stat_tracker',
  })
}
