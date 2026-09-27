import { isPeriodEndSubEvent } from '@/lib/match-event-notes'
import { formatRecapMinutes } from '@/lib/match-recap'
import {
  applyTeamBoxScoreEvent,
  emptyTeamBoxScoreTotals,
  hasTeamBoxScoreTotals,
  type TeamBoxScoreTotals,
} from '@/lib/match-shot-save'
import { assignParentEventPeriodIndexes, type ParentLiveEvent } from '@/lib/parent-hub'

export type ParentTeamBoxScoreModel = {
  periodLabels: string[]
  periods: TeamBoxScoreTotals[]
  total: TeamBoxScoreTotals
  setupLengthTitle: string
  setupLengthLabel: string
  playedSeconds: number
  playedLengthLabel: string
  hasStats: boolean
}

function mergeBoxScore(into: TeamBoxScoreTotals, from: TeamBoxScoreTotals) {
  into.homeGoals += from.homeGoals
  into.awayGoals += from.awayGoals
  into.homeShots += from.homeShots
  into.awayShots += from.awayShots
  into.homeSaves += from.homeSaves
  into.awaySaves += from.awaySaves
  into.homeCorners += from.homeCorners
  into.awayCorners += from.awayCorners
}

export function formatParentSetupLengthLabel(halfLengthMinutes: number): string {
  const minutes = Math.max(1, Math.round(halfLengthMinutes))
  return `${minutes} min`
}

export function periodColumnLabels(totalPeriods?: number | null, extraCount = 0): string[] {
  const planned = totalPeriods === 3 ? 3 : 2
  const count = Math.max(planned, extraCount)
  return Array.from({ length: count }, (_, index) => {
    if (planned === 3) return `${index + 1}${index === 0 ? 'st' : index === 1 ? 'nd' : 'rd'}`
    if (index === 0) return '1H'
    if (index === 1) return '2H'
    return `${index + 1}H`
  })
}

type PeriodClockSample = {
  timestamp: number
  createdAt: string
  isPeriodEnd: boolean
}

/**
 * On-clock length of one period.
 * A real `period_end` wins over a later sub. A whistle stored at 0:00 is the
 * stopped-clock rewind (full-time remaining snapped back to kickoff), so the
 * length is the later of the last logged action and kickoff-to-whistle wall time.
 */
export function playedSecondsForPeriod(events: PeriodClockSample[]): number {
  if (events.length === 0) return 0

  let endStamp = -1
  let maxStamp = 0
  let firstCreated = events[0]!.createdAt
  let zeroEndCreated: string | null = null

  for (const event of events) {
    const ts = Math.max(0, Math.floor(event.timestamp))
    if (event.createdAt < firstCreated) firstCreated = event.createdAt
    if (event.isPeriodEnd) {
      endStamp = Math.max(endStamp, ts)
      if (ts === 0 && (!zeroEndCreated || event.createdAt > zeroEndCreated)) {
        zeroEndCreated = event.createdAt
      }
      continue
    }
    maxStamp = Math.max(maxStamp, ts)
  }

  if (endStamp > 0) return endStamp
  if (endStamp < 0) return maxStamp

  let played = maxStamp
  if (zeroEndCreated) {
    const wallMs = Date.parse(zeroEndCreated) - Date.parse(firstCreated)
    if (Number.isFinite(wallMs) && wallMs > 0) {
      played = Math.max(played, Math.round(wallMs / 1000))
    }
  }
  return played
}

/** Actual on-clock length of each period — prefer a real tagged period_end. */
export function computeParentPeriodPlayedSeconds(events: ParentLiveEvent[]): number[] {
  if (events.length === 0) return []
  const periodById = assignParentEventPeriodIndexes(events)
  const byPeriod = new Map<number, PeriodClockSample[]>()

  for (const event of events) {
    const period = periodById.get(event.id) ?? 1
    const bucket = byPeriod.get(period) ?? []
    bucket.push({
      timestamp: event.timestamp,
      createdAt: event.createdAt,
      isPeriodEnd: isPeriodEndSubEvent(event.eventType, event.eventNotes),
    })
    byPeriod.set(period, bucket)
  }

  const maxPeriod = Math.max(1, ...periodById.values())
  const seconds: number[] = []
  for (let period = 1; period <= maxPeriod; period += 1) {
    seconds.push(playedSecondsForPeriod(byPeriod.get(period) ?? []))
  }
  return seconds
}

export function buildParentTeamBoxScore(
  events: ParentLiveEvent[],
  options: { halfLengthMinutes: number; totalPeriods?: number | null },
): ParentTeamBoxScoreModel {
  const periodById = assignParentEventPeriodIndexes(events)
  const byPeriod = new Map<number, TeamBoxScoreTotals>()
  const total = emptyTeamBoxScoreTotals()

  for (const event of events) {
    const period = periodById.get(event.id) ?? 1
    const bucket = byPeriod.get(period) ?? emptyTeamBoxScoreTotals()
    applyTeamBoxScoreEvent(bucket, event.eventType, event.isPk)
    byPeriod.set(period, bucket)
  }

  for (const bucket of byPeriod.values()) {
    mergeBoxScore(total, bucket)
  }

  const playedByPeriod = computeParentPeriodPlayedSeconds(events)
  const extraCount = Math.max(byPeriod.size, playedByPeriod.length)
  const periodLabels = periodColumnLabels(options.totalPeriods, extraCount)
  const periods = periodLabels.map((_, index) => byPeriod.get(index + 1) ?? emptyTeamBoxScoreTotals())
  const playedSeconds = playedByPeriod.reduce((sum, seconds) => sum + seconds, 0)

  return {
    periodLabels,
    periods,
    total,
    setupLengthTitle: options.totalPeriods === 3 ? 'Period length' : 'Half length',
    setupLengthLabel: formatParentSetupLengthLabel(options.halfLengthMinutes),
    playedSeconds,
    playedLengthLabel: playedSeconds > 0 ? formatRecapMinutes(playedSeconds) : '',
    hasStats: hasTeamBoxScoreTotals(total),
  }
}
