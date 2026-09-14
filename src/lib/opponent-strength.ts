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
  'Weighted Impact (WPI) sums each match’s on-pitch net shot differential, weighted by opponent strength (Better ×1.5, Equal ×1.0, Lesser ×0.5) and the coach’s 1–5 player rating (÷3 so a 3 is baseline). Unset strength counts as Equal; missing rating counts as 3.'

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
): number {
  const rating =
    coachRating == null || !Number.isFinite(coachRating)
      ? WPI_BASELINE_COACH_RATING
      : coachRating
  return (
    netShotDifferential *
    opponentStrengthMultiplier(opponentStrength) *
    (rating / WPI_BASELINE_COACH_RATING)
  )
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
