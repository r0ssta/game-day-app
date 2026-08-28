import type { DbMatchEvent } from '@/types/database'
import type { MatchPlayer } from '@/types/match'
import { formatPlayerFullName } from '@/lib/player-names'

export type CardKind = 'yellow' | 'red'

export type PlayerCardSummary = {
  playerId: string
  name: string
  yellowCards: number
  redCards: number
  /** Display label e.g. "Noah (Yellow)", "Liam (Red)", "Ava (2 Yellow → Red)" */
  label: string
}

/** Apply yellow/red card events onto live MatchPlayer card state. */
export function applyCardsFromEvents(
  players: MatchPlayer[],
  events: Array<Pick<DbMatchEvent, 'player_id' | 'event_type'>>,
): MatchPlayer[] {
  const yellows = new Map<string, number>()
  const sentOff = new Set<string>()

  for (const event of events) {
    if (!event.player_id) continue
    if (event.event_type === 'yellow_card') {
      yellows.set(event.player_id, (yellows.get(event.player_id) ?? 0) + 1)
    }
    if (event.event_type === 'red_card') {
      sentOff.add(event.player_id)
    }
  }

  return players.map((player) => {
    const yellowCardCount = yellows.get(player.id) ?? player.yellowCardCount ?? 0
    const isSentOff = sentOff.has(player.id) || player.isSentOff
    return {
      ...player,
      yellowCardCount,
      isSentOff,
      isOnField: isSentOff ? false : player.isOnField,
    }
  })
}

export function countPlayerCards(
  events: Array<Pick<DbMatchEvent, 'player_id' | 'event_type'>>,
  playerId: string,
): { yellowCards: number; redCards: number } {
  let yellowCards = 0
  let redCards = 0
  for (const event of events) {
    if (event.player_id !== playerId) continue
    if (event.event_type === 'yellow_card') yellowCards += 1
    if (event.event_type === 'red_card') redCards += 1
  }
  return { yellowCards, redCards }
}

/**
 * Build discipline lines for recap / parent email.
 * Omits players with no cards. Labels prefer first name when unique enough via full name.
 */
export function buildDisciplineCardSummaries(
  events: Array<Pick<DbMatchEvent, 'player_id' | 'event_type'>>,
  players: Array<Pick<MatchPlayer, 'id' | 'firstName' | 'lastName'>>,
): PlayerCardSummary[] {
  const playersById = new Map(players.map((p) => [p.id, p]))
  const tallies = new Map<string, { yellowCards: number; redCards: number }>()

  for (const event of events) {
    if (!event.player_id) continue
    if (event.event_type !== 'yellow_card' && event.event_type !== 'red_card') continue
    const row = tallies.get(event.player_id) ?? { yellowCards: 0, redCards: 0 }
    if (event.event_type === 'yellow_card') row.yellowCards += 1
    if (event.event_type === 'red_card') row.redCards += 1
    tallies.set(event.player_id, row)
  }

  const summaries: PlayerCardSummary[] = []
  for (const [playerId, tally] of tallies) {
    if (tally.yellowCards === 0 && tally.redCards === 0) continue
    const player = playersById.get(playerId)
    const name = player
      ? player.firstName.trim() || formatPlayerFullName(player.firstName, player.lastName)
      : 'Player'

    let label: string
    if (tally.redCards > 0 && tally.yellowCards >= 2) {
      label = `${name} (2 Yellow → Red)`
    } else if (tally.redCards > 0 && tally.yellowCards === 1) {
      label = `${name} (Yellow, Red)`
    } else if (tally.redCards > 0) {
      label = `${name} (Red)`
    } else if (tally.yellowCards >= 2) {
      label = `${name} (${tally.yellowCards} Yellow)`
    } else {
      label = `${name} (Yellow)`
    }

    summaries.push({
      playerId,
      name,
      yellowCards: tally.yellowCards,
      redCards: tally.redCards,
      label,
    })
  }

  return summaries.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
}
