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

export function aggregateTeamShotSaveTotals(
  events: Array<{ event_type?: string; eventType?: string }>,
): TeamShotSaveTotals {
  const totals = emptyTeamShotSaveTotals()
  for (const event of events) {
    const eventType = event.event_type ?? event.eventType
    switch (eventType) {
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
  return totals
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
