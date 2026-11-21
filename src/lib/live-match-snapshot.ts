import { applyCardsFromEvents } from '@/lib/match-cards'
import { allocateSecondsByRole } from '@/lib/play-time'
import { resolveLiveMatchClock } from '@/lib/match-clock'
import { resolveCurrentPeriod, resolveTotalPeriods } from '@/lib/match-periods'
import { aggregateTeamShotSaveTotals, type TeamShotSaveTotals } from '@/lib/match-shot-save'
import { isLiveMatchStatus, MATCH_STATUS } from '@/lib/match-status'
import { shouldResumePenaltyShootout } from '@/lib/penalty-kicks'
import { parseQualitativeContext } from '@/lib/qualitative-context'
import { poolPlayerToGuestRoster } from '@/lib/season-roster'
import { publishLiveMatchEvents } from '@/lib/live-match-events'
import {
  fetchMatchById,
  fetchMatchEvents,
  fetchMatchStatsByMatchId,
  fetchPlayersByIds,
  rebuildMatchPlayers,
} from '@/lib/supabase-api'
import type { DbMatch, DbMatchEvent } from '@/types/database'
import type { AppMode, MatchPlayer, MatchPeriod, RosterPlayer, TotalPeriods } from '@/types/match'

const PERIOD_END_NOTE = 'period_end'

/** Ignore Realtime echoes of our own clock write. Must exceed a half-length save. */
export const CLOCK_ECHO_MS = 8000
/** Snap to the remote countdown when devices have drifted this far. */
export const CLOCK_ADOPT_DRIFT_SECONDS = 3

/** Score fields used to tell a clock heartbeat apart from a concurrent coach write. */
const MATCH_SCORE_COMPARE_KEYS = [
  'home_score',
  'away_score',
  'home_pk_score',
  'away_pk_score',
  'pk_winner_is_us',
  'status',
] as const

/**
 * Match fields a second coach has to see immediately. A clock-only write
 * leaves all of these alone.
 */
const LIVE_STATE_KEYS = [
  ...MATCH_SCORE_COMPARE_KEYS,
  'period_clock_started',
  'period_start_time',
  'current_period',
  'period',
  'half_length',
  'period_length',
  'total_periods',
  'sub_interval_seconds',
  'gk_plays_full_half',
  'goes_to_pks',
  'pk_gk_player_id',
  'qualitative_context',
] as const

function sameJsonValue(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true
  if (left == null || right == null) return false
  if (typeof left !== 'object' || typeof right !== 'object') return false
  try {
    return JSON.stringify(left) === JSON.stringify(right)
  } catch {
    return false
  }
}

/**
 * True when a `matches` UPDATE only moved the live clock. Requires
 * REPLICA IDENTITY FULL so `payload.old` includes score columns.
 * PK-only old rows cannot be classified and must not be ignored.
 * Kickoff, period end, and the halftime lineup live on this same row, so a
 * change to any of those still counts.
 */
export function isMatchClockHeartbeatUpdate(
  newRow: Record<string, unknown> | null | undefined,
  oldRow: Record<string, unknown> | null | undefined,
): boolean {
  if (!newRow || !oldRow) return false
  if (!MATCH_SCORE_COMPARE_KEYS.some((key) => key in oldRow)) return false
  if (!('clock_seconds' in oldRow) || !('clock_seconds' in newRow)) return false
  if (Object.is(oldRow.clock_seconds, newRow.clock_seconds)) return false

  for (const key of LIVE_STATE_KEYS) {
    if (!(key in oldRow) || !(key in newRow)) continue
    const same =
      key === 'qualitative_context'
        ? sameJsonValue(oldRow[key], newRow[key])
        : Object.is(oldRow[key], newRow[key])
    if (!same) return false
  }
  return true
}

/**
 * Copy cards, +/-, and availability from a remote snapshot without moving
 * players who are still in the match or replacing an in-progress swap.
 */
export function mergeRemotePlayerOverlays(
  local: MatchPlayer[],
  remote: MatchPlayer[],
): MatchPlayer[] {
  if (local.length === 0 || remote.length === 0) return local
  const remoteById = new Map(remote.map((player) => [player.id, player]))
  let changed = false
  const next = local.map((player) => {
    const remotePlayer = remoteById.get(player.id)
    if (!remotePlayer) return player
    const localReason = player.absenceReason ?? null
    const remoteReason = remotePlayer.absenceReason ?? null
    const cardsMatch =
      player.yellowCardCount === remotePlayer.yellowCardCount &&
      player.isSentOff === remotePlayer.isSentOff &&
      player.plusMinus === remotePlayer.plusMinus
    const availabilityMatch =
      player.attending === remotePlayer.attending && localReason === remoteReason
    if (cardsMatch && availabilityMatch) return player
    changed = true
    return {
      ...player,
      yellowCardCount: remotePlayer.yellowCardCount,
      isSentOff: remotePlayer.isSentOff,
      plusMinus: remotePlayer.plusMinus,
      attending: remotePlayer.attending,
      absenceReason: remoteReason,
      // Marked out on another device — take them off the pitch. Coming back
      // lands on the bench; don't pull a local on-field player off otherwise.
      ...(remotePlayer.attending ? {} : { isOnField: false, subbedInAt: null }),
    }
  })
  return changed ? next : local
}

/**
 * Once the period clock is running, the server lineup and banked minutes are
 * the shared match. A second coach adopts subs and open-stint anchors from
 * that snapshot. A missing anchor means "on since this period started" —
 * stamping it at the current countdown made those players read 0:00.
 * A local anchor is kept when the snapshot still has null, so a stale read
 * cannot wipe a stint this device just started.
 */
export function mergeRemoteLivePlayers(
  local: MatchPlayer[],
  remote: MatchPlayer[],
  options?: { periodStartRemaining?: number },
): MatchPlayer[] {
  if (remote.length === 0) return local
  const remoteById = new Map(remote.map((player) => [player.id, player]))
  const seen = new Set<string>()
  let changed = false

  const next = local.map((player) => {
    const remotePlayer = remoteById.get(player.id)
    if (!remotePlayer) return player
    seen.add(player.id)
    const merged = applyRemoteLivePlayer(player, remotePlayer, options?.periodStartRemaining)
    if (merged !== player) changed = true
    return merged
  })

  for (const remotePlayer of remote) {
    if (seen.has(remotePlayer.id)) continue
    changed = true
    next.push(anchorOpenStint(remotePlayer, options?.periodStartRemaining))
  }

  return changed ? next : local
}

function applyRemoteLivePlayer(
  local: MatchPlayer,
  remote: MatchPlayer,
  periodStartRemaining?: number,
): MatchPlayer {
  const keepLocalAnchor =
    local.isOnField &&
    remote.isOnField &&
    remote.subbedInAt == null &&
    local.subbedInAt != null
  const banked = bankedSecondsFromRemote(local, remote)
  const subbedInAt = keepLocalAnchor ? local.subbedInAt : remote.subbedInAt
  const draft: MatchPlayer = {
    ...local,
    isOnField: remote.isOnField,
    matchPosition: remote.matchPosition,
    subbedInAt,
    totalSecondsPlayed: banked.totalSecondsPlayed,
    fieldSecondsPlayed: banked.fieldSecondsPlayed,
    gkSecondsPlayed: banked.gkSecondsPlayed,
    isFirstHalfStarter: remote.isFirstHalfStarter,
    isSecondHalfStarter: remote.isSecondHalfStarter,
    attending: remote.attending,
    absenceReason: remote.absenceReason ?? null,
    yellowCardCount: remote.yellowCardCount,
    isSentOff: remote.isSentOff,
    plusMinus: remote.plusMinus,
  }
  const anchored = anchorOpenStint(draft, keepLocalAnchor ? undefined : periodStartRemaining)
  return livePlayStateEqual(local, anchored) ? local : anchored
}

function anchorOpenStint(player: MatchPlayer, periodStartRemaining?: number): MatchPlayer {
  if (!player.isOnField || player.subbedInAt != null || periodStartRemaining == null) return player
  return { ...player, subbedInAt: periodStartRemaining }
}

function bankedSecondsFromRemote(
  local: MatchPlayer,
  remote: MatchPlayer,
): Pick<MatchPlayer, 'totalSecondsPlayed' | 'fieldSecondsPlayed' | 'gkSecondsPlayed'> {
  if (local.totalSecondsPlayed === remote.totalSecondsPlayed) {
    return {
      totalSecondsPlayed: local.totalSecondsPlayed,
      fieldSecondsPlayed: local.fieldSecondsPlayed,
      gkSecondsPlayed: local.gkSecondsPlayed,
    }
  }

  // A stale snapshot must not erase minutes this device already banked (e.g. after
  // halftime finalize, or when period-end stats for bench players lag).
  if (local.totalSecondsPlayed > remote.totalSecondsPlayed) {
    return {
      totalSecondsPlayed: local.totalSecondsPlayed,
      fieldSecondsPlayed: local.fieldSecondsPlayed,
      gkSecondsPlayed: local.gkSecondsPlayed,
    }
  }

  const localField = Math.max(0, local.fieldSecondsPlayed ?? 0)
  const localGk = Math.max(0, local.gkSecondsPlayed ?? 0)
  const delta = remote.totalSecondsPlayed - local.totalSecondsPlayed
  const splitTracked = local.fieldSecondsPlayed != null || local.gkSecondsPlayed != null
  if (splitTracked && localField + localGk === local.totalSecondsPlayed && delta > 0) {
    const role = allocateSecondsByRole(delta, remote.matchPosition)
    return {
      totalSecondsPlayed: remote.totalSecondsPlayed,
      fieldSecondsPlayed: localField + role.fieldSecondsPlayed,
      gkSecondsPlayed: localGk + role.gkSecondsPlayed,
    }
  }

  const role = allocateSecondsByRole(remote.totalSecondsPlayed, remote.matchPosition)
  return {
    totalSecondsPlayed: remote.totalSecondsPlayed,
    fieldSecondsPlayed: role.fieldSecondsPlayed,
    gkSecondsPlayed: role.gkSecondsPlayed,
  }
}

function livePlayStateEqual(left: MatchPlayer, right: MatchPlayer): boolean {
  return (
    left.isOnField === right.isOnField &&
    left.matchPosition === right.matchPosition &&
    left.subbedInAt === right.subbedInAt &&
    left.totalSecondsPlayed === right.totalSecondsPlayed &&
    (left.fieldSecondsPlayed ?? null) === (right.fieldSecondsPlayed ?? null) &&
    (left.gkSecondsPlayed ?? null) === (right.gkSecondsPlayed ?? null) &&
    left.isFirstHalfStarter === right.isFirstHalfStarter &&
    left.isSecondHalfStarter === right.isSecondHalfStarter &&
    left.attending === right.attending &&
    (left.absenceReason ?? null) === (right.absenceReason ?? null) &&
    left.yellowCardCount === right.yellowCardCount &&
    left.isSentOff === right.isSentOff &&
    left.plusMinus === right.plusMinus
  )
}

export type StaffLiveAppMode = Extract<AppMode, 'home' | 'match' | 'halftime' | 'penalty_shootout'>

export type LiveMatchSnapshot = {
  match: DbMatch
  roster: RosterPlayer[]
  players: MatchPlayer[]
  shotSaveTotals: TeamShotSaveTotals
  clockSeconds: number
  formationId: string | null
  endedOnFieldIds: string[]
  hasEndedAPeriod: boolean
}

export type LiveMatchHydrateResult = {
  matchId: string
  status: DbMatch['status']
  mode: StaffLiveAppMode
  periodClockStarted: boolean
  currentPeriod: number
  totalPeriods: TotalPeriods
  period: MatchPeriod
  homeScore: number
  awayScore: number
  seconds: number
}

/**
 * After this device kicks off a period, a snapshot fetched during the write still
 * shows everyone on the bench (period-end status). Adopting it would clear the pitch.
 */
export function isStaleKickoffSnapshot(input: {
  localClockStarted: boolean
  localOnFieldCount: number
  remoteOnFieldCount: number
}): boolean {
  return (
    input.localClockStarted &&
    input.localOnFieldCount > 0 &&
    input.remoteOnFieldCount === 0
  )
}

/**
 * This device is the live clock source. Remote snapshots are always a few
 * seconds behind the heartbeat and must not rewind or stop the tick.
 */
export function shouldHoldLocalLiveClock(input: {
  clockOwned: boolean
  appMode: AppMode
  periodClockStarted: boolean
  running: boolean
}): boolean {
  if (input.clockOwned) return true
  // Intermission lineup is local — a period-end snapshot still looks like
  // 1st-half warmup (clock stopped, everyone benched, current_period=1).
  if (input.appMode === 'halftime') return true
  if (input.appMode !== 'match') return false
  return input.periodClockStarted || input.running
}

/**
 * Ready-to-start lineup is local after the coach edits it. Polling / Realtime
 * snapshots still carry the scheduled XI and must not overwrite that draft.
 */
export function shouldAdoptRemotePreKickoffLineup(input: {
  localRunning: boolean
  periodClockStarted: boolean
  lineupDraftLocked: boolean
}): boolean {
  if (input.localRunning || input.periodClockStarted) return false
  return !input.lineupDraftLocked
}

export function shouldAdoptRemoteClock(input: {
  localSeconds: number
  remoteSeconds: number
  localClockWrittenAtMs: number
  nowMs: number
  remoteClockStarted: boolean
  localClockStarted: boolean
  /** This device is ticking locally — never let a hydrate rewind the display. */
  localRunning: boolean
}): boolean {
  // The 5s heartbeat is always behind the live countdown. Actions hydrate from
  // that snapshot and would put ~5 seconds back on the clock if we adopted it.
  if (input.localRunning) return false

  if (
    input.localClockWrittenAtMs > 0 &&
    input.nowMs - input.localClockWrittenAtMs < CLOCK_ECHO_MS
  ) {
    return false
  }

  // Stale snapshot from before this device kicked off — keep the local countdown.
  if (input.localClockStarted && !input.remoteClockStarted) return false

  // Resume / other staff device started the period — take their clock.
  if (input.remoteClockStarted && !input.localClockStarted) return true

  // Ready screen: DB 0:00 is an uninitialized row, not a real countdown.
  // Adopting it made kickoff write "already past a full half" timestamps.
  if (
    !input.localClockStarted &&
    !input.remoteClockStarted &&
    input.remoteSeconds <= 0 &&
    input.localSeconds > 0
  ) {
    return false
  }

  // Countdown remaining: a higher remote value is a rewind toward kickoff.
  // Only catch up when remote is ahead.
  return input.remoteSeconds < input.localSeconds - CLOCK_ADOPT_DRIFT_SECONDS
}

export function latestFormationFromEvents(
  events: Array<Pick<DbMatchEvent, 'formation'>>,
): string | null {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const formation = events[index]?.formation?.trim()
    if (formation) return formation
  }
  return null
}

/** Players who were on the field when the most recent period ended. */
export function latestPeriodEndOnFieldIds(
  events: Array<Pick<DbMatchEvent, 'event_type' | 'event_notes' | 'player_id'>>,
): string[] {
  let end = -1
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index]
    if (event?.event_type === 'sub_out' && event.event_notes === PERIOD_END_NOTE) {
      end = index
      break
    }
  }
  if (end < 0) return []

  const ids: string[] = []
  for (let index = end; index >= 0; index -= 1) {
    const event = events[index]
    if (event.event_type !== 'sub_out' || event.event_notes !== PERIOD_END_NOTE) break
    if (event.player_id) ids.push(event.player_id)
  }
  return ids
}

export function isActiveStaffMatchScreen(mode: AppMode): mode is StaffLiveAppMode {
  return mode === 'match' || mode === 'halftime' || mode === 'penalty_shootout'
}

export function resolveStaffLiveAppMode(input: {
  status: DbMatch['status']
  periodClockStarted: boolean
  currentPeriod: number
  totalPeriods: TotalPeriods
  period: MatchPeriod
  homeScore: number
  awayScore: number
  goesToPks: boolean
  pkWinnerIsUs: boolean | null
  hasEndedAPeriod: boolean
}): StaffLiveAppMode {
  if (!isLiveMatchStatus(input.status)) return 'home'

  if (
    input.status === MATCH_STATUS.penaltyShootout ||
    shouldResumePenaltyShootout({
      status: input.status,
      period: input.period,
      period_clock_started: input.periodClockStarted,
      home_score: input.homeScore,
      away_score: input.awayScore,
      goes_to_pks: input.goesToPks,
      pk_winner_is_us: input.pkWinnerIsUs,
      total_periods: input.totalPeriods,
      current_period: input.currentPeriod,
    })
  ) {
    return 'penalty_shootout'
  }

  if (input.status === MATCH_STATUS.extraTimeFirstHalf || input.status === MATCH_STATUS.extraTimeSecondHalf) {
    return 'match'
  }

  if (
    !input.periodClockStarted &&
    input.hasEndedAPeriod &&
    input.currentPeriod >= 1 &&
    input.currentPeriod < input.totalPeriods
  ) {
    return 'halftime'
  }

  return 'match'
}

export async function fetchLiveMatchSnapshot(
  matchId: string,
  roster: RosterPlayer[],
): Promise<LiveMatchSnapshot | null> {
  const [match, stats, events] = await Promise.all([
    fetchMatchById(matchId),
    fetchMatchStatsByMatchId(matchId),
    fetchMatchEvents(matchId),
  ])
  if (!match) return null
  publishLiveMatchEvents(matchId, events)

  const rosterIds = new Set(roster.map((player) => player.id))
  const missingIds = stats
    .map((stat) => stat.player_id)
    .filter((id) => id && !rosterIds.has(id))

  let nextRoster = roster
  if (missingIds.length > 0) {
    const guests = await fetchPlayersByIds(missingIds)
    nextRoster = [...roster]
    for (const guest of guests) {
      nextRoster.push(poolPlayerToGuestRoster(guest, match.team_id))
    }
  }

  const matchPlayers = rebuildMatchPlayers(nextRoster, stats)
  const players = applyCardsFromEvents(matchPlayers, events)
  const endedOnFieldIds = latestPeriodEndOnFieldIds(events)

  return {
    match,
    roster: nextRoster,
    players,
    shotSaveTotals: aggregateTeamShotSaveTotals(events),
    clockSeconds: resolveLiveMatchClock({
      periodStartTime: match.period_start_time,
      accumulatedSecondsBeforePause: match.accumulated_seconds_before_pause,
      clockSeconds: match.clock_seconds,
      addedTimeSeconds: parseQualitativeContext(match.qualitative_context).addedTimeSeconds,
      periodClockStarted: match.period_clock_started,
      halfLengthMinutes: match.period_length ?? match.half_length,
      nowMs: Date.now(),
    }).remaining,
    formationId: latestFormationFromEvents(events),
    endedOnFieldIds,
    hasEndedAPeriod: endedOnFieldIds.length > 0,
  }
}

export function snapshotHydrateResult(
  snapshot: LiveMatchSnapshot,
  seconds: number,
): LiveMatchHydrateResult {
  const { match, hasEndedAPeriod } = snapshot
  const totalPeriods = resolveTotalPeriods(match)
  const currentPeriod = resolveCurrentPeriod(match)
  return {
    matchId: match.id,
    status: match.status,
    mode: resolveStaffLiveAppMode({
      status: match.status,
      periodClockStarted: match.period_clock_started,
      currentPeriod,
      totalPeriods,
      period: match.period,
      homeScore: match.home_score,
      awayScore: match.away_score,
      goesToPks: Boolean(match.goes_to_pks),
      pkWinnerIsUs: match.pk_winner_is_us ?? null,
      hasEndedAPeriod,
    }),
    periodClockStarted: match.period_clock_started,
    currentPeriod,
    totalPeriods,
    period: match.period,
    homeScore: match.home_score,
    awayScore: match.away_score,
    seconds,
  }
}
