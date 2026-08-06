import type { MatchPlayer } from '@/types/match'

/** Derive on-field and bench lists from the single master players array. */
export function splitMatchRoster(players: MatchPlayer[]) {
  const onFieldPlayers = players.filter((player) => player.attending && player.isOnField)
  const benchPlayers = players.filter((player) => player.attending && !player.isOnField)
  return { onFieldPlayers, benchPlayers }
}
