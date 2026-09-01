import { describe, expect, it } from 'vitest'
import {
  canFinalizePkShootout,
  createEmptyPkRounds,
  matchResultBucket,
  shouldEnterPenaltyShootout,
  shouldResumePenaltyShootout,
  type PkRoundState,
} from './penalty-kicks'

function completeRegulation(homeMakes: number, awayMakes: number): PkRoundState[] {
  const rounds = createEmptyPkRounds()
  for (const round of rounds) {
    round.usResult = round.round <= homeMakes ? 'make' : 'miss'
    round.opponentResult = round.round <= awayMakes ? 'make' : 'miss'
  }
  return rounds
}

describe('penalty-kicks', () => {
  it('does not finalize a tied shootout', () => {
    expect(canFinalizePkShootout(completeRegulation(3, 3))).toBe(false)
  })

  it('finalizes once regulation rounds are complete and there is a winner', () => {
    expect(canFinalizePkShootout(completeRegulation(4, 3))).toBe(true)
  })

  it('enters PKs only when tied and goesToPks is set', () => {
    expect(shouldEnterPenaltyShootout({ homeScore: 1, awayScore: 1, goesToPks: true })).toBe(true)
    expect(shouldEnterPenaltyShootout({ homeScore: 2, awayScore: 1, goesToPks: true })).toBe(false)
    expect(shouldEnterPenaltyShootout({ homeScore: 1, awayScore: 1, goesToPks: false })).toBe(false)
  })

  it('resumes an unfinished shootout after the last period', () => {
    expect(
      shouldResumePenaltyShootout({
        status: 'live',
        period: '2nd',
        period_clock_started: false,
        home_score: 1,
        away_score: 1,
        goes_to_pks: true,
        pk_winner_is_us: null,
        total_periods: 2,
        current_period: 2,
      }),
    ).toBe(true)
  })

  it('does not resume after a PK winner is stored', () => {
    expect(
      shouldResumePenaltyShootout({
        status: 'live',
        period: '2nd',
        period_clock_started: false,
        home_score: 1,
        away_score: 1,
        goes_to_pks: true,
        pk_winner_is_us: true,
        total_periods: 2,
        current_period: 2,
      }),
    ).toBe(false)
  })

  it('counts PK winners as wins, not draws', () => {
    expect(
      matchResultBucket({
        home_score: 1,
        away_score: 1,
        home_pk_score: 4,
        away_pk_score: 3,
        pk_winner_is_us: true,
      }),
    ).toBe('win')
    expect(
      matchResultBucket({
        home_score: 1,
        away_score: 1,
        home_pk_score: 3,
        away_pk_score: 4,
        pk_winner_is_us: false,
      }),
    ).toBe('loss')
    expect(
      matchResultBucket({
        home_score: 1,
        away_score: 1,
        home_pk_score: 0,
        away_pk_score: 0,
        pk_winner_is_us: null,
      }),
    ).toBe('draw')
  })
})
