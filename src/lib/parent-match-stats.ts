import { formatPlayerFullName } from '@/lib/player-names'
import {
  cleanRecapPositionNote,
  isPeriodEndSubEvent,
  isStartingLineupEvent,
} from '@/lib/match-event-notes'
import { formatRecapMinutes } from '@/lib/match-recap'
import { isGoalkeeperPosition, unpairedShotImpliesSave } from '@/lib/match-shot-save'
import {
  assignParentEventPeriodIndexes,
  type ParentHubPlayer,
  type ParentLiveEvent,
} from '@/lib/parent-hub'

export type ParentPositionMinutes = {
  position: string
  seconds: number
}

export type ParentHalfStat = {
  started: boolean
  seconds: number
  positions: ParentPositionMinutes[]
  goals: number
  assists: number
  saves: number
  yellowCards: number
  redCards: number
}

export type ParentMatchPlayerStat = {
  playerId: string
  name: string
  jersey: number | null
  halves: [ParentHalfStat, ParentHalfStat]
  extraHalves: ParentHalfStat[]
  total: ParentHalfStat
}

function emptyHalf(): ParentHalfStat {
  return {
    started: false,
    seconds: 0,
    positions: [],
    goals: 0,
    assists: 0,
    saves: 0,
    yellowCards: 0,
    redCards: 0,
  }
}

function addPositionSeconds(half: ParentHalfStat, position: string, seconds: number) {
  const add = Math.max(0, seconds)
  if (add <= 0) return
  half.seconds += add
  const slot = position.trim() || '—'
  const existing = half.positions.find((row) => row.position === slot)
  if (existing) existing.seconds += add
  else half.positions.push({ position: slot, seconds: add })
}

function mergeHalves(halves: ParentHalfStat[]): ParentHalfStat {
  const total = emptyHalf()
  for (const half of halves) {
    total.started = total.started || half.started
    total.goals += half.goals
    total.assists += half.assists
    total.saves += half.saves
    total.yellowCards += half.yellowCards
    total.redCards += half.redCards
    for (const row of half.positions) {
      addPositionSeconds(total, row.position, row.seconds)
    }
  }
  return total
}

function halfPlayedAsGoalkeeper(half: ParentHalfStat): boolean {
  return (
    half.saves > 0 ||
    half.positions.some((row) => isGoalkeeperPosition(row.position))
  )
}

export function formatParentHalfRole(half: ParentHalfStat): string {
  if (half.started) return 'Started'
  if (half.seconds > 0) return 'Came on'
  return '—'
}

export function formatParentTotalRole(row: ParentMatchPlayerStat): string {
  const started: string[] = []
  if (row.halves[0].started) started.push('1H')
  if (row.halves[1].started) started.push('2H')
  row.extraHalves.forEach((half, index) => {
    if (half.started) started.push(`${index + 3}H`)
  })
  if (started.length === 0) return row.total.seconds > 0 ? 'Came on' : '—'
  if (
    started.length === 2 &&
    row.halves[0].started &&
    row.halves[1].started &&
    row.extraHalves.every((half) => !half.started)
  ) {
    return 'Started both'
  }
  return `Started ${started.join(' · ')}`
}

export function formatParentPositionsLine(positions: ParentPositionMinutes[]): string {
  if (positions.length === 0) return '—'
  return positions
    .map((row) => `${row.position} ${formatRecapMinutes(row.seconds)}`)
    .join(', ')
}

export function formatParentCountingStats(
  half: ParentHalfStat,
  options?: { includeSaves?: boolean },
): string {
  const parts: string[] = []
  if (half.goals > 0) parts.push(`G ${half.goals}`)
  if (half.assists > 0) parts.push(`A ${half.assists}`)
  if (half.yellowCards > 0) parts.push(`YC ${half.yellowCards}`)
  if (half.redCards > 0) parts.push(`RC ${half.redCards}`)
  const showSaves = options?.includeSaves ?? halfPlayedAsGoalkeeper(half)
  if (showSaves && half.saves > 0) {
    parts.push(`SV ${half.saves}`)
  }
  return parts.join(' · ')
}

export function shouldShowParentSaves(half: ParentHalfStat): boolean {
  return halfPlayedAsGoalkeeper(half)
}

function halfForPeriod(
  halves: Map<number, ParentHalfStat>,
  period: number,
): ParentHalfStat {
  const existing = halves.get(period)
  if (existing) return existing
  const created = emptyHalf()
  halves.set(period, created)
  return created
}

type OpenStint = {
  period: number
  position: string
  startTimestamp: number
}

/** Parent-safe per-player box score from public match events (no ratings or coach notes). */
export function buildParentMatchPlayerStats(
  events: ParentLiveEvent[],
  _matchId: string,
  halfLengthMinutes: number,
  players: ParentHubPlayer[],
): ParentMatchPlayerStat[] {
  const playersById = new Map(players.map((player) => [player.id, player] as const))
  const periodById = assignParentEventPeriodIndexes(events)
  const chrono = [...events].sort(
    (a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
  )
  const fallbackHalfSeconds = Math.max(1, halfLengthMinutes) * 60

  const byPlayer = new Map<
    string,
    {
      halves: Map<number, ParentHalfStat>
      open: OpenStint | null
    }
  >()
  const lastTimestampByPeriod = new Map<number, number>()

  const ensurePlayer = (playerId: string) => {
    const existing = byPlayer.get(playerId)
    if (existing) return existing
    const created = { halves: new Map<number, ParentHalfStat>(), open: null as OpenStint | null }
    byPlayer.set(playerId, created)
    return created
  }

  const closeOpen = (playerId: string, endTimestamp: number) => {
    const row = byPlayer.get(playerId)
    if (!row?.open) return
    const seconds = Math.max(0, endTimestamp - row.open.startTimestamp)
    addPositionSeconds(halfForPeriod(row.halves, row.open.period), row.open.position, seconds)
    row.open = null
  }

  const closeOpenForNewPeriod = (playerId: string, nextPeriod: number) => {
    const row = byPlayer.get(playerId)
    if (!row?.open) return
    if (row.open.period === nextPeriod) {
      closeOpen(playerId, row.open.startTimestamp)
      return
    }
    const endAt = lastTimestampByPeriod.get(row.open.period) ?? row.open.startTimestamp
    closeOpen(playerId, endAt)
  }

  for (const event of chrono) {
    const period = periodById.get(event.id) ?? 1
    lastTimestampByPeriod.set(
      period,
      Math.max(lastTimestampByPeriod.get(period) ?? 0, event.timestamp),
    )

    if (event.eventType === 'goal' && event.assistPlayerId) {
      halfForPeriod(ensurePlayer(event.assistPlayerId).halves, period).assists += 1
    }

    if (event.eventType === 'shot_away' && unpairedShotImpliesSave(chrono, event)) {
      for (const [playerId, row] of byPlayer) {
        if (row.open && isGoalkeeperPosition(row.open.position)) {
          halfForPeriod(row.halves, period).saves += 1
          break
        }
      }
    }

    if (!event.playerId) continue
    const row = ensurePlayer(event.playerId)
    const half = halfForPeriod(row.halves, period)
    const isLineup = isStartingLineupEvent(event.eventType, event.eventNotes, event.timestamp)
    const position = cleanRecapPositionNote(event.eventNotes)

    switch (event.eventType) {
      case 'sub_in':
        closeOpenForNewPeriod(event.playerId, period)
        if (isLineup) half.started = true
        row.open = {
          period,
          position: position ?? '—',
          startTimestamp: event.timestamp,
        }
        break
      case 'position_change':
        if (row.open) {
          closeOpen(event.playerId, event.timestamp)
        }
        row.open = {
          period,
          position: position ?? '—',
          startTimestamp: event.timestamp,
        }
        break
      case 'sub_out':
        closeOpen(event.playerId, event.timestamp)
        break
      case 'goal':
        half.goals += 1
        break
      case 'assist':
        half.assists += 1
        break
      case 'save_home':
        half.saves += 1
        break
      case 'yellow_card':
        half.yellowCards += 1
        break
      case 'red_card':
        half.redCards += 1
        break
      default:
        break
    }

    if (isPeriodEndSubEvent(event.eventType, event.eventNotes) && event.playerId) {
      closeOpen(event.playerId, event.timestamp)
    }
  }

  for (const [playerId, row] of byPlayer) {
    if (!row.open) continue
    const endAt = lastTimestampByPeriod.get(row.open.period) ?? fallbackHalfSeconds
    closeOpen(playerId, endAt)
  }

  const lines: ParentMatchPlayerStat[] = []
  for (const [playerId, row] of byPlayer) {
    const first = row.halves.get(1) ?? emptyHalf()
    const second = row.halves.get(2) ?? emptyHalf()
    const extraHalves = [...row.halves.entries()]
      .filter(([period]) => period > 2)
      .sort((a, b) => a[0] - b[0])
      .map(([, half]) => half)
    const total = mergeHalves([first, second, ...extraHalves])
    const hasActivity =
      total.seconds > 0 ||
      total.goals > 0 ||
      total.assists > 0 ||
      total.saves > 0 ||
      total.yellowCards > 0 ||
      total.redCards > 0
    if (!hasActivity) continue

    const player = playersById.get(playerId)
    lines.push({
      playerId,
      name: player ? formatPlayerFullName(player.firstName, player.lastName) : 'Player',
      jersey: player?.number ?? null,
      halves: [first, second],
      extraHalves,
      total,
    })
  }

  return lines.sort((a, b) => {
    const jerseyA = a.jersey ?? 999
    const jerseyB = b.jersey ?? 999
    if (jerseyA !== jerseyB) return jerseyA - jerseyB
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
  })
}
