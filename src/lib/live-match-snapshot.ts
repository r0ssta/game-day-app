import { applyCardsFromEvents } from '@/lib/match-cards'
import {
  restoreMatchClockSeconds,
} from '@/lib/match-clock'
import { resolveCurrentPeriod, resolveTotalPeriods } from '@/lib/match-periods'
import { aggregateTeamShotSaveTotals, type TeamShotSaveTotals } from '@/lib/match-shot-save'
import { shouldResumePenaltyShootout } from '@/lib/penalty-kicks'
import { parseQualitativeContext } from '@/lib/qualitative-context'
import { poolPlayerToGuestRoster } from '@/lib/season-roster'
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

/** Ignore Realtime echoes of our own clock heartbeat. */
export const CLOCK_ECHO_MS = 2000
/** Snap to the remote countdown when devices have drifted this far. */
export const CLOCK_ADOPT_DRIFT_SECONDS = 3

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

export function shouldAdoptRemoteClock(input: {
  localSeconds: number
  remoteSeconds: number
  localClockWrittenAtMs: number
  nowMs: number
  remoteClockStarted: boolean
  localClockStarted: boolean
}): boolean {
  if (
    input.localClockWrittenAtMs > 0 &&
    input.nowMs - input.localClockWrittenAtMs < CLOCK_ECHO_MS
  ) {
    return false
  }
  if (input.remoteClockStarted !== input.localClockStarted) return true
  return Math.abs(input.remoteSeconds - input.localSeconds) > CLOCK_ADOPT_DRIFT_SECONDS
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

export function isActiveStaffMatchScreen(mode: AppMode): boolean {
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
  if (input.status !== 'live') return 'home'

  if (
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

  const matchPlayers = rebuildMatchPlayers(nextRoster, stats).filter(
    (player) => player.attending,
  )
  const players = applyCardsFromEvents(matchPlayers, events)
  const endedOnFieldIds = latestPeriodEndOnFieldIds(events)

  return {
    match,
    roster: nextRoster,
    players,
    shotSaveTotals: aggregateTeamShotSaveTotals(events),
    clockSeconds: restoreMatchClockSeconds(
      match.clock_seconds,
      parseQualitativeContext(match.qualitative_context).addedTimeSeconds,
    ),
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
