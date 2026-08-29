import type { DbMatch, DbMatchEvent } from '@/types/database'
import type { MatchPlayer } from '@/types/match'

export type PkResult = 'make' | 'miss'
export type PkTeam = 'us' | 'opponent'

export type PkAttemptNotes = {
  result: PkResult
  team: PkTeam
  round: number
}

export type PkRoundState = {
  round: number
  usPlayerId: string | null
  usResult: PkResult | null
  opponentResult: PkResult | null
}

export const INITIAL_PK_ROUNDS = 5

export function createEmptyPkRounds(count = INITIAL_PK_ROUNDS): PkRoundState[] {
  return Array.from({ length: count }, (_, index) => ({
    round: index + 1,
    usPlayerId: null,
    usResult: null,
    opponentResult: null,
  }))
}

export function encodePkAttemptNotes(payload: PkAttemptNotes): string {
  return JSON.stringify(payload)
}

export function parsePkAttemptNotes(raw: string | null | undefined): PkAttemptNotes | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Partial<PkAttemptNotes>
    if (
      (parsed.result === 'make' || parsed.result === 'miss') &&
      (parsed.team === 'us' || parsed.team === 'opponent') &&
      typeof parsed.round === 'number' &&
      Number.isFinite(parsed.round)
    ) {
      return {
        result: parsed.result,
        team: parsed.team,
        round: parsed.round,
      }
    }
  } catch {
    // fall through
  }
  return null
}

export function countPkMakes(rounds: PkRoundState[], team: PkTeam): number {
  return rounds.reduce((total, round) => {
    const result = team === 'us' ? round.usResult : round.opponentResult
    return total + (result === 'make' ? 1 : 0)
  }, 0)
}

export function pkScoresFromRounds(rounds: PkRoundState[]): {
  homePkScore: number
  awayPkScore: number
} {
  return {
    homePkScore: countPkMakes(rounds, 'us'),
    awayPkScore: countPkMakes(rounds, 'opponent'),
  }
}

/** True when both sides have a result for every round currently shown. */
export function allPkRoundsComplete(rounds: PkRoundState[]): boolean {
  return rounds.every((round) => round.usResult !== null && round.opponentResult !== null)
}

export function canFinalizePkShootout(rounds: PkRoundState[]): boolean {
  const { homePkScore, awayPkScore } = pkScoresFromRounds(rounds)
  if (homePkScore === awayPkScore) return false
  if (rounds.length < INITIAL_PK_ROUNDS) return false
  // Allow early finalize once regulation 5 are done, or any sudden-death set is complete.
  const regulation = rounds.slice(0, INITIAL_PK_ROUNDS)
  if (!allPkRoundsComplete(regulation)) return false
  if (rounds.length === INITIAL_PK_ROUNDS) return true
  return allPkRoundsComplete(rounds)
}

export type MatchScoreFields = Pick<
  DbMatch,
  'home_score' | 'away_score' | 'home_pk_score' | 'away_pk_score' | 'pk_winner_is_us'
>

/**
 * Historical score line for recaps / reporting.
 * PK games: "T 1-1 (W 4-3 on PKs)" or "T 2-2 (L 4-5 on PKs)".
 * Otherwise: "1–2".
 */
export function formatMatchResultScore(match: MatchScoreFields): string {
  const base = `${match.home_score}–${match.away_score}`
  if (match.pk_winner_is_us == null) return base
  const wl = match.pk_winner_is_us ? 'W' : 'L'
  return `T ${base} (${wl} ${match.home_pk_score}-${match.away_pk_score} on PKs)`
}

export function formatMatchFinalLabel(match: MatchScoreFields): string {
  return `Final ${formatMatchResultScore(match)}`
}

/** Season W/L/D — PK winners count as wins/losses, not draws. */
export function matchResultBucket(
  match: MatchScoreFields,
): 'win' | 'loss' | 'draw' {
  if (match.home_score > match.away_score) return 'win'
  if (match.home_score < match.away_score) return 'loss'
  if (match.pk_winner_is_us === true) return 'win'
  if (match.pk_winner_is_us === false) return 'loss'
  return 'draw'
}

export function rebuildPkRoundsFromEvents(events: DbMatchEvent[]): PkRoundState[] {
  const pkEvents = events.filter((event) => event.event_type === 'pk_attempt')
  if (pkEvents.length === 0) return createEmptyPkRounds()

  let maxRound = INITIAL_PK_ROUNDS
  const byRound = new Map<number, PkRoundState>()

  for (const event of pkEvents) {
    const fromColumns =
      (event.pk_result === 'make' || event.pk_result === 'miss') &&
      (event.pk_team === 'us' || event.pk_team === 'opponent')
        ? {
            result: event.pk_result,
            team: event.pk_team,
            round: parsePkAttemptNotes(event.event_notes)?.round ?? event.timestamp,
          }
        : parsePkAttemptNotes(event.event_notes)

    if (!fromColumns) continue
    const round = Math.max(1, Math.floor(fromColumns.round))
    maxRound = Math.max(maxRound, round)
    const existing = byRound.get(round) ?? {
      round,
      usPlayerId: null,
      usResult: null,
      opponentResult: null,
    }
    if (fromColumns.team === 'us') {
      existing.usResult = fromColumns.result
      existing.usPlayerId = event.player_id
    } else {
      existing.opponentResult = fromColumns.result
    }
    byRound.set(round, existing)
  }

  return Array.from({ length: maxRound }, (_, index) => {
    const round = index + 1
    return (
      byRound.get(round) ?? {
        round,
        usPlayerId: null,
        usResult: null,
        opponentResult: null,
      }
    )
  })
}

export function shouldEnterPenaltyShootout(input: {
  homeScore: number
  awayScore: number
  goesToPks: boolean
}): boolean {
  return input.goesToPks && input.homeScore === input.awayScore
}

export function shouldResumePenaltyShootout(match: {
  status: string
  period: string
  period_clock_started: boolean
  home_score: number
  away_score: number
  goes_to_pks?: boolean | null
  pk_winner_is_us?: boolean | null
  /** When set, last regulation period must match before resuming PKs. */
  total_periods?: number | null
  current_period?: number | null
}): boolean {
  const totalPeriods = match.total_periods === 3 ? 3 : 2
  const currentPeriod =
    typeof match.current_period === 'number' && match.current_period > 0
      ? match.current_period
      : match.period === '3rd'
        ? 3
        : match.period === '2nd'
          ? 2
          : 1
  const onLastPeriod = currentPeriod >= totalPeriods

  return (
    match.status === 'live' &&
    onLastPeriod &&
    !match.period_clock_started &&
    Boolean(match.goes_to_pks) &&
    match.home_score === match.away_score &&
    match.pk_winner_is_us == null
  )
}

function isGoalkeeperPosition(position: string | null | undefined): boolean {
  if (!position) return false
  const normalized = position.trim().toUpperCase()
  return (
    normalized === 'GK' ||
    normalized === 'KEEPER' ||
    normalized === 'GOALKEEPER' ||
    normalized.includes('GK')
  )
}

/** Prefer on-field GK, then attending players with a GK roster position. */
export function findMatchGoalkeeper(players: MatchPlayer[]): MatchPlayer | null {
  const attending = players.filter((player) => player.attending)
  const onFieldGk = attending.find(
    (player) => player.isOnField && isGoalkeeperPosition(player.matchPosition),
  )
  if (onFieldGk) return onFieldGk
  return (
    attending.find(
      (player) =>
        isGoalkeeperPosition(player.primaryPosition) ||
        isGoalkeeperPosition(player.position),
    ) ?? null
  )
}
