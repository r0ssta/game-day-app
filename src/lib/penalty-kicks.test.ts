import { describe, expect, it } from 'vitest'
import {
  canFinalizePkShootout,
  createEmptyPkRounds,
  matchResultBucket,
  shouldAutoEnterPenaltyShootoutAfterExtraTime,
  shouldEnterPenaltyShootout,
  shouldOfferTiedGameOverride,
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

  it('offers a tied-game override for knockout or legacy PK fixtures', () => {
    expect(
      shouldOfferTiedGameOverride({
        homeScore: 1,
        awayScore: 1,
        isTournamentKnockout: true,
        goesToPks: false,
        matchStatus: 'live',
      }),
    ).toBe(true)
    expect(
      shouldOfferTiedGameOverride({
        homeScore: 1,
        awayScore: 1,
        isTournamentKnockout: false,
        goesToPks: false,
        matchStatus: 'live',
      }),
    ).toBe(false)
  })

  it('auto-enters PKs when extra time 2nd is still tied', () => {
    expect(
      shouldAutoEnterPenaltyShootoutAfterExtraTime({
        homeScore: 2,
        awayScore: 2,
        matchStatus: 'extra_time_second_half',
      }),
    ).toBe(true)
  })

  it('resumes an unfinished shootout from penalty_shootout status', () => {
    expect(
      shouldResumePenaltyShootout({
        status: 'penalty_shootout',
        period: '2nd',
        period_clock_started: false,
        home_score: 1,
        away_score: 1,
        goes_to_pks: false,
        pk_winner_is_us: null,
        total_periods: 2,
        current_period: 2,
      }),
    ).toBe(true)
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
