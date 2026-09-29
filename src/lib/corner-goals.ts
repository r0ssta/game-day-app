import { isPeriodStartBoundary } from '@/lib/match-event-notes'

/**
 * Older goals have no coach answer. Those still count when they follow that
 * team's corner inside this window. A stored yes or no replaces it.
 */
export const CORNER_GOAL_WINDOW_SECONDS = 60

/** Ask the coach when that team's corner is still this recent on the match clock. */
export const CORNER_GOAL_PROMPT_SECONDS = 90

export type CornerGoalClockEvent = {
  id: string
  eventType: string
  timestamp: number
  createdAt: string
  eventNotes?: string | null
  /** Coach answer. Null or omitted means the question was not asked. */
  fromCorner?: boolean | null
}

export function isWithinCornerGoalWindow(goalTimestamp: number, cornerTimestamp: number): boolean {
  const delta = goalTimestamp - cornerTimestamp
  return delta >= 0 && delta <= CORNER_GOAL_WINDOW_SECONDS
}

export function isWithinCornerGoalPrompt(goalTimestamp: number, cornerTimestamp: number): boolean {
  const delta = goalTimestamp - cornerTimestamp
  return delta >= 0 && delta <= CORNER_GOAL_PROMPT_SECONDS
}

/** Latest same-period corner clock time for each side. Used to decide whether to ask. */
export function latestCornerElapsedInPeriod(
  events: CornerGoalClockEvent[],
  period: number,
): { home: number | null; away: number | null } {
  const periodById = periodIndexes(events)
  const ordered = events
    .filter((event) => (periodById.get(event.id) ?? 1) === period)
    .sort((a, b) => a.timestamp - b.timestamp || a.createdAt.localeCompare(b.createdAt))
  let home: number | null = null
  let away: number | null = null
  for (const event of ordered) {
    const side = cornerSide(event.eventType)
    if (side === 'home') home = event.timestamp
    else if (side === 'away') away = event.timestamp
  }
  return { home, away }
}

function cornerSide(eventType: string): 'home' | 'away' | null {
  if (eventType === 'corner_home') return 'home'
  if (eventType === 'corner_away') return 'away'
  return null
}

function goalSide(eventType: string): 'home' | 'away' | null {
  if (eventType === 'goal') return 'home'
  if (eventType === 'opponent_goal') return 'away'
  return null
}

function periodIndexes(events: CornerGoalClockEvent[]): Map<string, number> {
  const chrono = [...events].sort(
    (a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
  )
  let period = 1
  let lastTimestamp = 0
  const periodById = new Map<string, number>()

  for (const event of chrono) {
    if (
      isPeriodStartBoundary({
        eventType: event.eventType,
        eventNotes: event.eventNotes,
        timestamp: event.timestamp,
        previousTimestamp: lastTimestamp,
      })
    ) {
      period += 1
    }
    lastTimestamp = event.timestamp
    periodById.set(event.id, period)
  }

  return periodById
}

/**
 * Goal and opponent-goal ids the coach marked as from a corner.
 * Goals with no stored answer fall back to {@link CORNER_GOAL_WINDOW_SECONDS}.
 */
export function goalIdsFromCorners(events: CornerGoalClockEvent[]): Set<string> {
  const periodById = periodIndexes(events)
  const byPeriod = new Map<number, CornerGoalClockEvent[]>()
  for (const event of events) {
    const period = periodById.get(event.id) ?? 1
    const bucket = byPeriod.get(period) ?? []
    bucket.push(event)
    byPeriod.set(period, bucket)
  }

  const ids = new Set<string>()
  for (const bucket of byPeriod.values()) {
    const ordered = [...bucket].sort(
      (a, b) => a.timestamp - b.timestamp || a.createdAt.localeCompare(b.createdAt),
    )
    let lastHomeCorner: number | null = null
    let lastAwayCorner: number | null = null
    for (const event of ordered) {
      const corner = cornerSide(event.eventType)
      if (corner === 'home') lastHomeCorner = event.timestamp
      else if (corner === 'away') lastAwayCorner = event.timestamp

      const scoringSide = goalSide(event.eventType)
      if (!scoringSide) continue
      if (event.fromCorner === true) {
        ids.add(event.id)
        continue
      }
      if (event.fromCorner === false) continue
      const cornerAt = scoringSide === 'home' ? lastHomeCorner : lastAwayCorner
      if (cornerAt == null) continue
      if (isWithinCornerGoalWindow(event.timestamp, cornerAt)) ids.add(event.id)
    }
  }

  return ids
}

export function countCornerGoals(events: CornerGoalClockEvent[]): { us: number; them: number } {
  const ids = goalIdsFromCorners(events)
  let us = 0
  let them = 0
  for (const event of events) {
    if (!ids.has(event.id)) continue
    if (event.eventType === 'goal') us += 1
    else if (event.eventType === 'opponent_goal') them += 1
  }
  return { us, them }
}
