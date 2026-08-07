import { getMatchSortTimestamp, matchDateTimeIso } from '@/lib/match-schedule'
import {
  DEFAULT_PRIMARY_POSITION,
  DEFAULT_SECONDARY_POSITION,
  legacyPositionToProfile,
  rosterProfilePositionToLegacy,
} from '@/lib/positions'
import { supabase } from '@/supabaseClient'
import { createMatchPlayer } from '@/lib/play-time'
import type { DbCoach, DbLineupPreset, DbMatch, DbMatchEvent, DbMatchReview, DbMatchStat, DbPlayer, DbTeam } from '@/types/database'
import type { LineupPresetFormationJson } from '@/lib/lineup-presets'
import type { Impact, MatchPeriod, MatchPlayer, RosterPlayer } from '@/types/match'

export type MatchEventInput = {
  matchId: string
  playerId: string
  eventType: 'goal' | 'assist' | 'sub_in' | 'sub_out' | 'position_change'
  timestamp: number
  formation: string
  eventNotes?: string | null
  assistPlayerId?: string | null
}

function matchEventToRow(event: MatchEventInput, includeExtended = true) {
  const row = {
    match_id: event.matchId,
    player_id: event.playerId,
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
    const legacyRows = rows.map((row) => {
      const {
        formation: _formation,
        event_notes: _eventNotes,
        assist_player_id: _assistPlayerId,
        ...legacy
      } = row as Record<string, unknown> & {
        formation?: string
        event_notes?: string | null
        assist_player_id?: string | null
      }
      return legacy
    })
    const { error: legacyError } = await supabase.from('match_events').insert(legacyRows)
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

  return {
    id: player.id,
    teamId: player.team_id,
    number: player.jersey,
    name: player.name,
    position: player.position,
    primaryPosition,
    secondaryPosition,
    isGuest: player.is_guest,
    contactInfo: player.contact_info ?? '',
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
  const { data, error } = await supabase.from('teams').insert({ name: trimmed }).select().single()
  if (error) throw error
  return data
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

export async function upsertPlayer(input: {
  id?: string
  teamId: string
  name: string
  jersey: number | null
  isGuest?: boolean
  position?: string
  primaryPosition?: string
  secondaryPosition?: string
  contactInfo?: string
}): Promise<DbPlayer> {
  const contact = input.contactInfo?.trim() || null
  const primaryPosition = input.primaryPosition?.trim() || DEFAULT_PRIMARY_POSITION
  const secondaryPosition = input.secondaryPosition?.trim() || DEFAULT_SECONDARY_POSITION
  const legacyPosition = input.position ?? rosterProfilePositionToLegacy(primaryPosition)
  const baseUpdate = {
    name: input.name.trim(),
    jersey: input.jersey,
    is_guest: input.isGuest ?? false,
    position: legacyPosition,
    active_status: true,
  }

  if (input.id) {
    const withProfile = {
      ...baseUpdate,
      contact_info: contact,
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
      const withContact = { ...baseUpdate, contact_info: contact }
      const { data: contactData, error: contactError } = await supabase
        .from('players')
        .update(withContact)
        .eq('id', input.id)
        .select()
        .single()
      if (!contactError) return contactData

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
    contact_info: contact,
    primary_position: primaryPosition,
    secondary_position: secondaryPosition,
  }
  const { data, error } = await supabase.from('players').insert(withProfile).select().single()
  if (!error) return data

  if (isMissingColumnError(error)) {
    const withContact = {
      team_id: input.teamId,
      ...baseUpdate,
      contact_info: contact,
    }
    const { data: contactData, error: contactError } = await supabase
      .from('players')
      .insert(withContact)
      .select()
      .single()
    if (!contactError) return contactData

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
  opponent: string
  location: string
  tournamentGame: boolean
  halfLength: number
  matchDate: string
  matchTime: string
}): Promise<DbMatch> {
  const basePayload = {
    team_id: input.teamId,
    coach_id: input.coachId,
    opponent: input.opponent,
    location: input.location,
    tournament_game: input.tournamentGame,
    half_length: input.halfLength,
    clock_seconds: input.halfLength * 60,
    date: matchDateTimeIso(input.matchDate, input.matchTime),
    status: 'active' as const,
  }

  const fullPayload = {
    ...basePayload,
    match_date: input.matchDate.trim() || null,
    match_time:
      input.matchTime.trim().length === 5
        ? `${input.matchTime.trim()}:00`
        : input.matchTime.trim() || null,
  }

  let { data, error } = await supabase.from('matches').insert(fullPayload).select().single()

  if (error && isMissingColumnError(error)) {
    ;({ data, error } = await supabase.from('matches').insert(basePayload).select().single())
  }

  if (error) throw error
  return data
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
  await insertMatchEventRows([matchEventToRow(input)])
}

export async function insertMatchEvents(events: MatchEventInput[]) {
  if (events.length === 0) return
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

export async function completeMatch(matchId: string) {
  const { error } = await supabase
    .from('matches')
    .update({ status: 'completed' })
    .eq('id', matchId)
  if (error) throw error
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
  impact: Impact
  notes: string
}

export async function savePostGameReview(
  matchId: string,
  reviews: PostGameReviewInput[],
  coachSummaryNotes?: string,
) {
  await saveCoachMatchSummary(matchId, coachSummaryNotes ?? '')

  if (reviews.length === 0) return

  const now = new Date().toISOString()
  const reviewRows = reviews.map((review) => ({
    match_id: matchId,
    player_id: review.playerId,
    impact_score: impactToScore(review.impact),
    review_notes: review.notes.trim() || null,
    updated_at: now,
  }))

  const { error: reviewError } = await supabase
    .from('match_reviews')
    .upsert(reviewRows, { onConflict: 'match_id,player_id' })
  if (reviewError && !isOptionalTableError(reviewError)) throw reviewError
  if (reviewError) {
    console.warn('[savePostGameReview] match_reviews unavailable:', formatSupabaseError(reviewError))
  }

  await Promise.all(
    reviews.map((review) =>
      supabase
        .from('match_stats')
        .update({ impact_score: impactToScore(review.impact) })
        .eq('match_id', matchId)
        .eq('player_id', review.playerId),
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
