import { isPeriodStartBoundary } from '@/lib/match-event-notes'

/** A goal counts as coming from a corner when it follows that team's corner on the match clock. */
export const CORNER_GOAL_WINDOW_SECONDS = 60

export type CornerGoalClockEvent = {
  id: string
  eventType: string
  timestamp: number
  createdAt: string
  eventNotes?: string | null
}

export function isWithinCornerGoalWindow(goalTimestamp: number, cornerTimestamp: number): boolean {
  const delta = goalTimestamp - cornerTimestamp
  return delta >= 0 && delta <= CORNER_GOAL_WINDOW_SECONDS
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
 * Goal and opponent-goal ids that follow the same team's corner within
 * {@link CORNER_GOAL_WINDOW_SECONDS} on the match clock, in the same period.
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
