/** Post-match player evaluation scale (Game Recap). Live match -/=/+ impact is separate. */

export type PlayerRating = 1 | 2 | 3 | 4 | 5

export const PLAYER_RATINGS = [1, 2, 3, 4, 5] as const

export const DEFAULT_PLAYER_RATING: PlayerRating = 3

export function isPlayerRating(value: unknown): value is PlayerRating {
  return value === 1 || value === 2 || value === 3 || value === 4 || value === 5
}

export function clampPlayerRating(value: number): PlayerRating {
  if (!Number.isFinite(value)) return DEFAULT_PLAYER_RATING
  const rounded = Math.round(value)
  if (rounded <= 1) return 1
  if (rounded >= 5) return 5
  return rounded as PlayerRating
}

/** Map legacy match_reviews / match_stats -1/0/1 scores onto 1–5. */
export function legacyImpactScoreToRating(score: number): PlayerRating {
  if (score <= -1) return 2
  if (score >= 1) return 5
  return 3
}

/** Keep match_stats.impact_score (-1/0/1) roughly aligned when saving a recap rating. */
export function ratingToLegacyImpactScore(rating: PlayerRating): number {
  if (rating <= 2) return -1
  if (rating >= 4) return 1
  return 0
}

export function averagePlayerRatings(ratings: number[]): number | null {
  const valid = ratings.filter((value) => Number.isFinite(value) && value >= 1 && value <= 5)
  if (valid.length === 0) return null
  const sum = valid.reduce((acc, value) => acc + value, 0)
  return sum / valid.length
}

export function formatPlayerRating(value: number | null | undefined, digits = 1): string {
  if (value == null || !Number.isFinite(value)) return '—'
  if (Number.isInteger(value)) return String(value)
  return value.toFixed(digits)
}
