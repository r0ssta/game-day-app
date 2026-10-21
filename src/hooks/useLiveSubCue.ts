import { useMatchClockSelector } from '@/lib/match-clock-store'
import { needsSubRotationCue } from '@/lib/play-time'
import type { MatchPlayer } from '@/types/match'

/** True once an on-field stint crosses the sub cue. Stays quiet on other clock ticks. */
export function useLiveSubCue(player: MatchPlayer, halfLengthSeconds: number): boolean {
  return useMatchClockSelector((seconds) =>
    needsSubRotationCue(player, seconds, halfLengthSeconds),
  )
}
