import type { DbMatchEvent } from '@/types/database'
import type { MatchPlayer } from '@/types/match'

export type TeamShotSaveEventType = 'shot_home' | 'shot_away' | 'save_home' | 'save_away'

export type TeamShotSaveTotals = {
  homeShots: number
  awayShots: number
  homeSaves: number
  awaySaves: number
}

export function isTeamShotSaveEventType(value: string): value is TeamShotSaveEventType {
  return (
    value === 'shot_home' ||
    value === 'shot_away' ||
    value === 'save_home' ||
    value === 'save_away'
  )
}

export function emptyTeamShotSaveTotals(): TeamShotSaveTotals {
  return { homeShots: 0, awayShots: 0, homeSaves: 0, awaySaves: 0 }
}

export function aggregateTeamShotSaveTotals(
  events: Array<Pick<DbMatchEvent, 'event_type'>>,
): TeamShotSaveTotals {
  const totals = emptyTeamShotSaveTotals()
  for (const event of events) {
    switch (event.event_type) {
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

export function formatTeamShotSaveLine(totals: TeamShotSaveTotals): string {
  return `Shots ${totals.homeShots}–${totals.awayShots} · Saves ${totals.homeSaves}–${totals.awaySaves}`
}
