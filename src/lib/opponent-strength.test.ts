import { describe, expect, it } from 'vitest'
import {
  computeWeightedNetShots,
  computeWeightedSides,
  opponentStrengthFromMatch,
  opponentStrengthMultiplier,
  opponentStrengthToTier,
  parseOpponentStrength,
  wpiScorelineFactor,
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

  it('scales the G/A bonus by sqrt of 3 over match team goals', () => {
    expect(wpiScorelineFactor(3)).toBe(1)
    expect(wpiScorelineFactor(6)).toBeCloseTo(Math.sqrt(0.5), 5)
    expect(wpiScorelineFactor(2)).toBeCloseTo(Math.sqrt(1.5), 5)
    expect(wpiScorelineFactor(0)).toBe(1)
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

  it('adds a personal goal and assist bonus to offense only', () => {
    const scorer = computeWeightedSides({
      teamGoals: 1,
      opponentGoals: 0,
      playerGoals: 1,
      matchTeamGoals: 3,
      opponentStrength: 'equal',
      coachRating: 3,
    })
    const assister = computeWeightedSides({
      teamGoals: 1,
      opponentGoals: 0,
      playerAssists: 1,
      matchTeamGoals: 3,
      opponentStrength: 'equal',
      coachRating: 3,
    })
    const onFieldOnly = computeWeightedSides({
      teamGoals: 1,
      opponentGoals: 0,
      opponentStrength: 'equal',
      coachRating: 3,
    })
    expect(scorer.offense).toBe(3)
    expect(assister.offense).toBe(2)
    expect(onFieldOnly.offense).toBe(1)
    expect(scorer.defense).toBe(0)
  })

  it('shrinks blowout goals and grows tight-game goals, then applies opponent strength', () => {
    const blowoutLesser = computeWeightedSides({
      playerGoals: 1,
      matchTeamGoals: 6,
      opponentStrength: 'lesser',
      coachRating: 3,
    })
    const tightEqual = computeWeightedSides({
      playerGoals: 1,
      matchTeamGoals: 2,
      opponentStrength: 'equal',
      coachRating: 3,
    })
    const tightBetter = computeWeightedSides({
      playerGoals: 1,
      matchTeamGoals: 2,
      opponentStrength: 'better',
      coachRating: 3,
    })
    const hatTrickBlowout = computeWeightedSides({
      playerGoals: 3,
      matchTeamGoals: 6,
      opponentStrength: 'equal',
      coachRating: 3,
    })
    expect(blowoutLesser.offense).toBeCloseTo(0.707, 3)
    expect(tightEqual.offense).toBeCloseTo(2.449, 3)
    expect(tightBetter.offense).toBeCloseTo(3.674, 3)
    expect(hatTrickBlowout.offense).toBeCloseTo(4.243, 3)
    expect(hatTrickBlowout.offense).toBeGreaterThan(tightEqual.offense)
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
