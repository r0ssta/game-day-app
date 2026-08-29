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

export function formatTeamShotSaveLine(totals: TeamShotSaveTotals): string {
  return `Shots ${totals.homeShots}–${totals.awayShots} · Saves ${totals.homeSaves}–${totals.awaySaves} · Corners ${totals.homeCorners}–${totals.awayCorners}`
}
