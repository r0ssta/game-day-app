import { formatFeedPeriodPrefix } from '@/lib/match-periods'
import { assignParentEventPeriodIndexes, type ParentLiveEvent } from '@/lib/parent-hub'
import { parseGoalType, parseOpponentGoalCategory } from '@/schemas/match-actions'

export type ScoreboardScorer = {
  key: string
  name: string
  /** Clock marks in the order they were scored, e.g. "1H 10' Pen". */
  marks: string[]
}

export type MatchScoreboardGoals = {
  us: ScoreboardScorer[]
  them: ScoreboardScorer[]
}

function isOurOwnGoal(event: ParentLiveEvent): boolean {
  return event.eventType === 'goal' && parseGoalType(event.eventNotes) === 'Own Goal'
}

function isTheirOwnGoal(event: ParentLiveEvent): boolean {
  return (
    event.eventType === 'opponent_goal' && parseOpponentGoalCategory(event.eventNotes) === 'Own Goal'
  )
}

function isPenalty(event: ParentLiveEvent): boolean {
  return event.isPk === true || parseGoalType(event.eventNotes) === 'PK'
}

function minuteMark(
  event: ParentLiveEvent,
  periodIndex: number,
  totalPeriods?: number | null,
): string {
  const period = formatFeedPeriodPrefix(periodIndex, totalPeriods)
  const minute = Math.max(0, Math.floor(event.timestamp / 60))
  return `${period} ${minute}'${isPenalty(event) ? ' Pen' : ''}`
}

function addScorer(
  side: ScoreboardScorer[],
  index: Map<string, ScoreboardScorer>,
  key: string,
  name: string,
  mark: string,
) {
  const existing = index.get(key)
  if (existing) {
    existing.marks.push(mark)
    return
  }
  const row = { key, name, marks: [mark] }
  index.set(key, row)
  side.push(row)
}

/**
 * Goal scorers for the recap header, grouped the way a match scoreboard does:
 * one line per scorer, goals in order, penalties marked on that minute.
 * The match clock resets each period, so each mark keeps its period (1H 10').
 */
export function buildMatchScoreboardGoals(
  events: ParentLiveEvent[],
  options: { teamName: string; opponent: string; totalPeriods?: number | null },
): MatchScoreboardGoals {
  const teamName = options.teamName.trim() || 'Home'
  const opponent = options.opponent.trim() || 'Opponent'
  const periodById = assignParentEventPeriodIndexes(events)
  const chrono = [...events].sort(
    (a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
  )

  const us: ScoreboardScorer[] = []
  const them: ScoreboardScorer[] = []
  const usIndex = new Map<string, ScoreboardScorer>()
  const themIndex = new Map<string, ScoreboardScorer>()

  for (const event of chrono) {
    if (event.eventType !== 'goal' && event.eventType !== 'opponent_goal') continue
    const mark = minuteMark(event, periodById.get(event.id) ?? 1, options.totalPeriods)

    if (event.eventType === 'goal') {
      if (isOurOwnGoal(event)) {
        addScorer(us, usIndex, 'us:og', 'Own Goal', mark)
        continue
      }
      const name = event.playerName?.trim()
      if (!name) {
        addScorer(us, usIndex, 'us:untagged', teamName, mark)
        continue
      }
      const key = event.playerId ? `us:${event.playerId}` : `us:name:${name}`
      addScorer(us, usIndex, key, name, mark)
      continue
    }

    if (isTheirOwnGoal(event)) {
      addScorer(them, themIndex, 'them:og', 'Own Goal', mark)
      continue
    }
    addScorer(them, themIndex, 'them:team', opponent, mark)
  }

  return { us, them }
}
