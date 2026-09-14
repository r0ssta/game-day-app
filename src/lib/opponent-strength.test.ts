import { describe, expect, it } from 'vitest'
import {
  computeWeightedNetShots,
  computeWeightedSides,
  opponentStrengthFromMatch,
  opponentStrengthMultiplier,
  opponentStrengthToTier,
  parseOpponentStrength,
} from './opponent-strength'

describe('opponent-strength', () => {
  it('parses column values and legacy qualitative tiers', () => {
    expect(parseOpponentStrength('better')).toBe('better')
    expect(parseOpponentStrength('tier3')).toBe('better')
    expect(parseOpponentStrength('superior')).toBe('better')
    expect(parseOpponentStrength('lesser')).toBe('lesser')
    expect(parseOpponentStrength('tier1')).toBe('lesser')
    expect(parseOpponentStrength('equal')).toBe('equal')
    expect(parseOpponentStrength('nope')).toBeNull()
  })

  it('maps strength to the stored qualitative tier', () => {
    expect(opponentStrengthToTier('lesser')).toBe('tier1')
    expect(opponentStrengthToTier('equal')).toBe('tier2')
    expect(opponentStrengthToTier('better')).toBe('tier3')
  })

  it('weights net shots by opponent strength and coach rating', () => {
    expect(opponentStrengthMultiplier('better')).toBe(1.5)
    expect(opponentStrengthMultiplier('equal')).toBe(1)
    expect(opponentStrengthMultiplier('lesser')).toBe(0.5)
    expect(opponentStrengthMultiplier(null)).toBe(1)
    expect(computeWeightedNetShots(10, 'better', 3)).toBe(15)
    expect(computeWeightedNetShots(10, 'lesser', 3)).toBe(5)
    expect(computeWeightedNetShots(10, 'equal', 5)).toBeCloseTo(16.666, 2)
    expect(computeWeightedNetShots(10, null, null)).toBe(10)
    expect(computeWeightedNetShots(10, 'equal', 3, 4)).toBe(14)
    expect(computeWeightedNetShots(10, 'equal', 3, 4, 2)).toBe(16)
  })

  it('splits WPI into offense and defense that sum to the combined index', () => {
    const sides = computeWeightedSides({
      teamGoals: 2,
      opponentGoals: 1,
      teamShots: 8,
      opponentShots: 5,
      teamCorners: 4,
      opponentCorners: 2,
      opponentStrength: 'equal',
      coachRating: 3,
    })
    expect(sides.offense).toBe(14)
    expect(sides.defense).toBe(-8)
    expect(sides.combined).toBe(6)
    expect(sides.combined).toBe(computeWeightedNetShots(3, 'equal', 3, 2, 1))
  })

  it('prefers the match column over qualitative context', () => {
    expect(
      opponentStrengthFromMatch({
        opponent_strength: 'better',
        qualitative_context: { opponentTier: 'tier1' },
      }),
    ).toBe('better')
    expect(
      opponentStrengthFromMatch({
        opponent_strength: null,
        qualitative_context: { opponentTier: 'tier1' },
      }),
    ).toBe('lesser')
  })
})
