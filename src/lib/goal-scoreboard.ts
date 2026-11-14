import { formatFeedPeriodPrefix } from '@/lib/match-periods'
import {
  assignParentEventPeriodIndexes,
  type ParentHubPlayer,
  type ParentLiveEvent,
} from '@/lib/parent-hub'
import { isOwnGoalType, parseGoalType, parseOpponentGoalCategory } from '@/schemas/match-actions'

export type ScoreboardSide = 'us' | 'them'

export type ScoreboardGoal = {
  id: string
  side: ScoreboardSide
  /** Last name, or null when the other side scored and no player was logged. */
  scorer: string | null
  /** Match minute, ESPN-style: `12'`, `35'`, `30+1'`, or `ET1 4'`. */
  minute: string
  assist: string | null
  penalty: boolean
  ownGoal: boolean
}

export type GoalScoreboardModel = {
  us: ScoreboardGoal[]
  them: ScoreboardGoal[]
}

/**
 * Minute shown on the recap scoreboard.
 *
 * Uses the same elapsed minute as the live feed (`floor(seconds / 60)`), then
 * stacks periods the way a soccer scoreboard does: 2nd-half 5' of a 30-minute
 * period is `35'`. Time past the period length is stoppage (`30+1'`). A goal
 * in the opening minute shows as `1'` rather than `0'`. Extra time stays on
 * its own clock (`ET1 4'`) because that period length is not stored on the match.
 */
export function formatScoreboardMinute(input: {
  timestampSeconds: number
  periodIndex: number
  periodLengthMinutes: number
  totalPeriods?: number | null
}): string {
  const length = Math.max(1, Math.round(input.periodLengthMinutes) || 30)
  const elapsedMinute = Math.max(0, Math.floor(Math.max(0, input.timestampSeconds) / 60))
  const planned = input.totalPeriods === 3 ? 3 : 2
  const periodIndex = Math.max(1, input.periodIndex)

  if (periodIndex > planned) {
    const prefix = formatFeedPeriodPrefix(periodIndex, planned)
    return `${prefix} ${Math.max(1, elapsedMinute)}'`
  }

  const offset = (periodIndex - 1) * length
  if (elapsedMinute > length) {
    return `${offset + length}+${elapsedMinute - length}'`
  }
  const shown = elapsedMinute === 0 ? 1 : elapsedMinute
  return `${offset + shown}'`
}

export function formatScoreboardGoalLine(
  goal: Pick<ScoreboardGoal, 'scorer' | 'minute' | 'assist' | 'penalty' | 'ownGoal'>,
): string {
  const who = goal.ownGoal ? 'Own goal' : goal.scorer
  const head = who ? `${who} ${goal.minute}` : goal.minute
  const notes: string[] = []
  if (goal.assist && !goal.ownGoal && !goal.penalty) notes.push(goal.assist)
  if (goal.penalty) notes.push('PK')
  return notes.length > 0 ? `${head} (${notes.join(', ')})` : head
}

function scoreboardName(
  playerId: string | null,
  fallbackName: string | null,
  players: ParentHubPlayer[],
): string | null {
  const roster = playerId ? players.find((player) => player.id === playerId) : undefined
  const first = roster?.firstName.trim() ?? ''
  const last = roster?.lastName.trim() ?? ''
  if (last) return disambiguatedLastName(first, last, players)
  if (first) return first

  const fallback = fallbackName?.trim()
  if (!fallback) return null
  const parts = fallback.split(/\s+/).filter(Boolean)
  if (parts.length === 0) return null
  if (parts.length === 1) return parts[0] ?? null
  return disambiguatedLastName(parts[0] ?? '', parts[parts.length - 1] ?? '', players)
}

function disambiguatedLastName(
  first: string,
  last: string,
  players: ParentHubPlayer[],
): string {
  const key = last.toLowerCase()
  const collisions = players.filter((player) => player.lastName.trim().toLowerCase() === key)
  const initial = first.charAt(0).toUpperCase()
  if (collisions.length > 1 && initial) return `${initial}. ${last}`
  return last
}

function isPenalty(event: ParentLiveEvent, side: ScoreboardSide, ownGoal: boolean): boolean {
  if (ownGoal) return false
  if (event.isPk === true) return true
  return side === 'us' && parseGoalType(event.eventNotes) === 'PK'
}

function isOwnGoal(event: ParentLiveEvent, side: ScoreboardSide): boolean {
  if (side === 'us') return isOwnGoalType(event.eventNotes)
  return parseOpponentGoalCategory(event.eventNotes) === 'Own Goal'
}

export function buildGoalScoreboard(
  events: ParentLiveEvent[],
  options: {
    periodLengthMinutes: number
    totalPeriods?: number | null
    players?: ParentHubPlayer[]
  },
): GoalScoreboardModel {
  const players = options.players ?? []
  const periodById = assignParentEventPeriodIndexes(events)
  const goals = events.filter(
    (event) => event.eventType === 'goal' || event.eventType === 'opponent_goal',
  )

  const ordered = [...goals].sort((a, b) => {
    const periodDelta = (periodById.get(a.id) ?? 1) - (periodById.get(b.id) ?? 1)
    if (periodDelta !== 0) return periodDelta
    if (a.timestamp !== b.timestamp) return a.timestamp - b.timestamp
    const created = a.createdAt.localeCompare(b.createdAt)
    if (created !== 0) return created
    return a.id.localeCompare(b.id)
  })

  const board: GoalScoreboardModel = { us: [], them: [] }
  for (const event of ordered) {
    const side: ScoreboardSide = event.eventType === 'goal' ? 'us' : 'them'
    const ownGoal = isOwnGoal(event, side)
    const penalty = isPenalty(event, side, ownGoal)
    const scorer = ownGoal ? null : scoreboardName(event.playerId, event.playerName, players)
    const assist =
      ownGoal || penalty
        ? null
        : scoreboardName(event.assistPlayerId, event.assistPlayerName, players)
    const goal: ScoreboardGoal = {
      id: event.id,
      side,
      scorer,
      minute: formatScoreboardMinute({
        timestampSeconds: event.timestamp,
        periodIndex: periodById.get(event.id) ?? 1,
        periodLengthMinutes: options.periodLengthMinutes,
        totalPeriods: options.totalPeriods,
      }),
      assist,
      penalty,
      ownGoal,
    }
    board[side].push(goal)
  }
  return board
}
