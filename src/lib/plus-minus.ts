import { buildAbsoluteMatchTimeline } from '@/lib/match-recap'
import type { DbMatchEvent } from '@/types/database'

import type { MatchPlayer } from '@/types/match'

export type PlusMinusLedger = Map<string, number>

export function formatPlusMinus(value: number): string {
  if (value > 0) return `+${value}`
  return String(value)
}

/**
 * NBA/NHL-style plus/minus: +1 for every player on the field at our goal,
 * -1 for every player on the field at an opponent goal. Bench players unchanged.
 */
export function computeMatchPlusMinus(
  events: DbMatchEvent[],
  halfLengthSeconds: number,
  options?: {
    /** Fallback when legacy matches lack sub_in events. */
    firstHalfStarterIds?: Iterable<string>
  },
): PlusMinusLedger {
  const timeline = buildAbsoluteMatchTimeline(events, halfLengthSeconds)
  const onField = new Set<string>()
  const ledger = new Map<string, number>()
  let sawSubstitution = false

  for (const event of timeline) {
    switch (event.event_type) {
      case 'sub_in':
        sawSubstitution = true
        if (event.player_id) onField.add(event.player_id)
        break
      case 'sub_out':
        sawSubstitution = true
        if (event.player_id) onField.delete(event.player_id)
        break
      case 'goal':
      case 'opponent_goal': {
        if (onField.size === 0 && !sawSubstitution && options?.firstHalfStarterIds) {
          for (const playerId of options.firstHalfStarterIds) {
            onField.add(playerId)
          }
        }

        const delta = event.event_type === 'goal' ? 1 : -1
        for (const playerId of onField) {
          ledger.set(playerId, (ledger.get(playerId) ?? 0) + delta)
        }
        break
      }
    }
  }

  return ledger
}

export function applyPlusMinusDelta(players: MatchPlayer[], delta: 1 | -1): MatchPlayer[] {
  return players.map((player) =>
    player.attending && player.isOnField
      ? { ...player, plusMinus: player.plusMinus + delta }
      : player,
  )
}

export function sumPlusMinusLedgers(ledgers: PlusMinusLedger[]): PlusMinusLedger {
  const total = new Map<string, number>()
  for (const ledger of ledgers) {
    for (const [playerId, value] of ledger) {
      total.set(playerId, (total.get(playerId) ?? 0) + value)
    }
  }
  return total
}
