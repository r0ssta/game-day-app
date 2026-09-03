import type { MatchPlayer } from '@/types/match'

export type TeamShotSaveEventType =
  | 'shot_home'
  | 'shot_away'
  | 'save_home'
  | 'save_away'
  | 'corner_home'
  | 'corner_away'

export type TeamShotSaveTotals = {
  homeShots: number
  awayShots: number
  homeSaves: number
  awaySaves: number
  homeCorners: number
  awayCorners: number
}

export type TeamBoxScoreTotals = TeamShotSaveTotals & {
  homeGoals: number
  awayGoals: number
}

export function isTeamShotSaveEventType(value: string): value is TeamShotSaveEventType {
  return (
    value === 'shot_home' ||
    value === 'shot_away' ||
    value === 'save_home' ||
    value === 'save_away' ||
    value === 'corner_home' ||
    value === 'corner_away'
  )
}

export function emptyTeamShotSaveTotals(): TeamShotSaveTotals {
  return {
    homeShots: 0,
    awayShots: 0,
    homeSaves: 0,
    awaySaves: 0,
    homeCorners: 0,
    awayCorners: 0,
  }
}

export function emptyTeamBoxScoreTotals(): TeamBoxScoreTotals {
  return {
    ...emptyTeamShotSaveTotals(),
    homeGoals: 0,
    awayGoals: 0,
  }
}

export function applyTeamBoxScoreEvent(
  totals: TeamBoxScoreTotals,
  eventType: string,
  isPk?: boolean | null,
): void {
  if (isPk && (eventType === 'goal' || eventType === 'opponent_goal')) return
  switch (eventType) {
    case 'goal':
      totals.homeGoals += 1
      break
    case 'opponent_goal':
      totals.awayGoals += 1
      break
    case 'shot_home':
      totals.homeShots += 1
      break
    case 'shot_away':
      totals.awayShots += 1
      break
    case 'save_home':
      totals.homeSaves += 1
      break
    case 'save_away':
      totals.awaySaves += 1
      break
    case 'corner_home':
      totals.homeCorners += 1
      break
    case 'corner_away':
      totals.awayCorners += 1
      break
    default:
      break
  }
}

/**
 * Coaches often tap Shot, not Save. A logged shot that did not become a goal
 * is a shot the other keeper stopped — fill saves from that identity so the
 * recap does not stay 0–0 when shots were recorded.
 */
export function reconcileSavesFromShots<T extends TeamShotSaveTotals & Partial<TeamBoxScoreTotals>>(
  totals: T,
): T {
  const homeGoals = totals.homeGoals ?? 0
  const awayGoals = totals.awayGoals ?? 0
  return {
    ...totals,
    homeSaves: Math.max(totals.homeSaves, Math.max(0, totals.awayShots - awayGoals)),
    awaySaves: Math.max(totals.awaySaves, Math.max(0, totals.homeShots - homeGoals)),
  }
}

type ShotSaveEventLike = {
  event_type?: string
  eventType?: string
  timestamp?: number
  is_pk?: boolean | null
  isPk?: boolean | null
}

function eventTypeOf(event: ShotSaveEventLike): string {
  return event.event_type ?? event.eventType ?? ''
}

/** True when this shot is not already paired with a goal or an explicit save. */
export function unpairedShotImpliesSave(
  events: ShotSaveEventLike[],
  shot: ShotSaveEventLike,
): boolean {
  const type = eventTypeOf(shot)
  if (type !== 'shot_home' && type !== 'shot_away') return false
  const goalType = type === 'shot_home' ? 'goal' : 'opponent_goal'
  const saveType = type === 'shot_home' ? 'save_away' : 'save_home'
  const timestamp = shot.timestamp
  if (timestamp == null) return false
  const hasPair = (want: string) =>
    events.some((event) => eventTypeOf(event) === want && event.timestamp === timestamp)
  return !hasPair(goalType) && !hasPair(saveType)
}

export function aggregateTeamBoxScoreTotals(events: ShotSaveEventLike[]): TeamBoxScoreTotals {
  const totals = emptyTeamBoxScoreTotals()
  for (const event of events) {
    applyTeamBoxScoreEvent(totals, eventTypeOf(event), event.is_pk ?? event.isPk)
  }
  return reconcileSavesFromShots(totals)
}

export function aggregateTeamShotSaveTotals(events: ShotSaveEventLike[]): TeamShotSaveTotals {
  return aggregateTeamBoxScoreTotals(events)
}

export function isGoalkeeperPosition(position: string | null | undefined): boolean {
  if (!position) return false
  const normalized = position.trim().toUpperCase()
  return (
    normalized === 'GK' ||
    normalized === 'KEEPER' ||
    normalized === 'GOALKEEPER' ||
    normalized.includes('GK')
  )
}

/** On-pitch GK only — used to auto-credit our team's saves. */
export function findActiveOnFieldGoalkeeper(players: MatchPlayer[]): MatchPlayer | null {
  return (
    players.find(
      (player) =>
        player.attending && player.isOnField && isGoalkeeperPosition(player.matchPosition),
    ) ?? null
  )
}

export function hasTeamShotSaveTotals(totals: TeamShotSaveTotals): boolean {
  return (
    totals.homeShots +
      totals.awayShots +
      totals.homeSaves +
      totals.awaySaves +
      totals.homeCorners +
      totals.awayCorners >
    0
  )
}

export function hasTeamBoxScoreTotals(totals: TeamBoxScoreTotals): boolean {
  return hasTeamShotSaveTotals(totals) || totals.homeGoals + totals.awayGoals > 0
}

export function formatTeamShotSaveLine(totals: TeamShotSaveTotals): string {
  return `Shots ${totals.homeShots}–${totals.awayShots} · Saves ${totals.homeSaves}–${totals.awaySaves} · Corners ${totals.homeCorners}–${totals.awayCorners}`
}

export type NamedTeamBoxScoreRow = {
  label: string
  us: number
  them: number
}

export function namedTeamBoxScoreRows(totals: TeamShotSaveTotals): NamedTeamBoxScoreRow[] {
  return [
    { label: 'Shots', us: totals.homeShots, them: totals.awayShots },
    { label: 'Saves', us: totals.homeSaves, them: totals.awaySaves },
    { label: 'Corners', us: totals.homeCorners, them: totals.awayCorners },
  ]
}
