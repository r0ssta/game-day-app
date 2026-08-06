import { matchDateTimeIso } from '@/lib/match-schedule'
import { supabase } from '@/supabaseClient'
import { createMatchPlayer } from '@/lib/play-time'
import type { DbCoach, DbMatch, DbMatchEvent, DbMatchReview, DbMatchStat, DbPlayer, DbTeam } from '@/types/database'
import type { Impact, MatchPeriod, MatchPlayer, RosterPlayer } from '@/types/match'

export type MatchEventInput = {
  matchId: string
  playerId: string
  eventType: 'goal' | 'assist' | 'sub_in' | 'sub_out' | 'position_change'
  timestamp: number
  formation: string
  eventNotes?: string | null
}

function matchEventToRow(event: MatchEventInput, includeFormation = true) {
  const row = {
    match_id: event.matchId,
    player_id: event.playerId,
    event_type: event.eventType,
    timestamp: event.timestamp,
    event_notes: event.eventNotes ?? null,
  }
  return includeFormation ? { ...row, formation: event.formation } : row
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
        ...legacy
      } = row as Record<string, unknown> & { formation?: string; event_notes?: string | null }
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
  return {
    id: player.id,
    teamId: player.team_id,
    number: player.jersey,
    name: player.name,
    position: player.position,
    isGuest: player.is_guest,
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

export async function fetchPlayersByTeamId(teamId: string): Promise<DbPlayer[]> {
  const { data, error } = await supabase
    .from('players')
    .select('*')
    .eq('team_id', teamId)
    .eq('active_status', true)
    .order('jersey')
  if (error) throw error
  return data ?? []
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
}): Promise<DbPlayer> {
  if (input.id) {
    const { data, error } = await supabase
      .from('players')
      .update({
        name: input.name.trim(),
        jersey: input.jersey,
        is_guest: input.isGuest ?? false,
        position: input.position ?? 'SUB',
        active_status: true,
      })
      .eq('id', input.id)
      .select()
      .single()
    if (error) throw error
    return data
  }

  const { data, error } = await supabase
    .from('players')
    .insert({
      team_id: input.teamId,
      name: input.name.trim(),
      jersey: input.jersey,
      is_guest: input.isGuest ?? false,
      position: input.position ?? 'SUB',
      active_status: true,
    })
    .select()
    .single()
  if (error) throw error
  return data
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

export async function completeMatch(matchId: string) {
  const { error } = await supabase
    .from('matches')
    .update({ status: 'completed' })
    .eq('id', matchId)
  if (error) throw error
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
  if (error) throw error
  return data ?? []
}

export type PostGameReviewInput = {
  playerId: string
  impact: Impact
  notes: string
}

export async function savePostGameReview(matchId: string, reviews: PostGameReviewInput[]) {
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
  if (reviewError) throw reviewError

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
