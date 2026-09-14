export type OpponentStrength = 'lesser' | 'equal' | 'better'

export const OPPONENT_STRENGTH_OPTIONS: Array<{
  id: OpponentStrength
  label: string
  description: string
}> = [
  { id: 'lesser', label: 'Lesser', description: 'We were favored' },
  { id: 'equal', label: 'Equal', description: 'Even matchup' },
  { id: 'better', label: 'Better', description: 'Stronger opponent' },
]

export const OPPONENT_STRENGTH_MULTIPLIER = {
  lesser: 0.5,
  equal: 1,
  better: 1.5,
} as const

/** Coach 1–5 rating that leaves WPI unchanged (matches missing reviews). */
export const WPI_BASELINE_COACH_RATING = 3

export const WPI_TOOLTIP =
  'Weighted Impact (WPI) is Offense + Defense. Each match weights on-pitch goals, shots, and corners by opponent strength (Better ×1.5, Equal ×1.0, Lesser ×0.5) and the coach’s 1–5 player rating (÷3 so a 3 is baseline). Unset strength counts as Equal; missing rating counts as 3. Minutes are not a separate multiplier.'

export const WPI_OFFENSE_TOOLTIP =
  'Offense is our goals, shots, and corners while the player was on the field, with the same opponent and rating weights as WPI. Higher is better. Offense + Defense = WPI.'

export const WPI_DEFENSE_TOOLTIP =
  'Defense is their goals, shots, and corners while the player was on the field, shown as a minus, with the same opponent and rating weights as WPI. Closer to zero is better. Offense + Defense = WPI.'

export function isOpponentStrength(value: unknown): value is OpponentStrength {
  return value === 'lesser' || value === 'equal' || value === 'better'
}

export function parseOpponentStrength(raw: unknown): OpponentStrength | null {
  if (isOpponentStrength(raw)) return raw
  if (raw === 'tier1' || raw === 'easy') return 'lesser'
  if (raw === 'tier2' || raw === 'competitive') return 'equal'
  if (raw === 'tier3' || raw === 'superior') return 'better'
  return null
}

export function opponentStrengthToTier(
  strength: OpponentStrength,
): 'tier1' | 'tier2' | 'tier3' {
  if (strength === 'lesser') return 'tier1'
  if (strength === 'better') return 'tier3'
  return 'tier2'
}

export function opponentStrengthMultiplier(
  strength: OpponentStrength | null | undefined,
): number {
  if (strength === 'better') return OPPONENT_STRENGTH_MULTIPLIER.better
  if (strength === 'lesser') return OPPONENT_STRENGTH_MULTIPLIER.lesser
  return OPPONENT_STRENGTH_MULTIPLIER.equal
}

export function computeWeightedNetShots(
  netShotDifferential: number,
  opponentStrength: OpponentStrength | null | undefined,
  coachRating: number | null | undefined = null,
  netCornerDifferential: number = 0,
  netGoalDifferential: number = 0,
): number {
  return computeWeightedSides({
    teamGoals: netGoalDifferential,
    opponentGoals: 0,
    teamShots: netShotDifferential,
    opponentShots: 0,
    teamCorners: netCornerDifferential,
    opponentCorners: 0,
    opponentStrength,
    coachRating,
  }).combined
}

export function computeWeightedSides(input: {
  teamGoals?: number
  opponentGoals?: number
  teamShots?: number
  opponentShots?: number
  teamCorners?: number
  opponentCorners?: number
  opponentStrength?: OpponentStrength | null
  coachRating?: number | null
}): { offense: number; defense: number; combined: number } {
  const rating =
    input.coachRating == null || !Number.isFinite(input.coachRating)
      ? WPI_BASELINE_COACH_RATING
      : input.coachRating
  const weight =
    opponentStrengthMultiplier(input.opponentStrength) * (rating / WPI_BASELINE_COACH_RATING)
  const offense =
    (input.teamGoals ?? 0) + (input.teamShots ?? 0) + (input.teamCorners ?? 0)
  const against =
    (input.opponentGoals ?? 0) + (input.opponentShots ?? 0) + (input.opponentCorners ?? 0)
  const offenseWeighted = offense * weight
  const defenseWeighted = -against * weight
  return {
    offense: offenseWeighted,
    defense: defenseWeighted,
    combined: offenseWeighted + defenseWeighted,
  }
}

export function opponentStrengthFromMatch(input: {
  opponent_strength?: string | null
  qualitative_context?: unknown
}): OpponentStrength | null {
  const fromColumn = parseOpponentStrength(input.opponent_strength)
  if (fromColumn) return fromColumn
  if (!input.qualitative_context || typeof input.qualitative_context !== 'object') {
    return null
  }
  const record = input.qualitative_context as Record<string, unknown>
  return parseOpponentStrength(
    record.opponentStrength ?? record.opponentTier ?? record.oppositionStrength,
  )
}
