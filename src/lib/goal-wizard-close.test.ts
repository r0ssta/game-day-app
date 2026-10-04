import { describe, expect, it } from 'vitest'
import { goalWizardCloseCommit } from './goal-wizard-close'

describe('goalWizardCloseCommit', () => {
  it('logs our goal untagged when the type sheet is closed', () => {
    expect(
      goalWizardCloseCommit({
        team: 'us',
        step: 'type',
        shotType: null,
        scorerId: null,
        fromCorner: null,
      }),
    ).toEqual({
      kind: 'our',
      scorerId: null,
      assistPlayerId: null,
      shotType: null,
      fromCorner: null,
    })
  })

  it('keeps a corner answer if the type sheet is closed after it', () => {
    expect(
      goalWizardCloseCommit({
        team: 'us',
        step: 'type',
        shotType: null,
        scorerId: null,
        fromCorner: true,
      }),
    ).toEqual({
      kind: 'our',
      scorerId: null,
      assistPlayerId: null,
      shotType: null,
      fromCorner: true,
    })
  })

  it('logs our goal without a corner answer when that question is dismissed', () => {
    expect(
      goalWizardCloseCommit({
        team: 'us',
        step: 'corner',
        shotType: null,
        scorerId: null,
        fromCorner: null,
      }),
    ).toEqual({
      kind: 'our',
      scorerId: null,
      assistPlayerId: null,
      shotType: null,
      fromCorner: null,
    })
  })

  it('logs an opponent goal when the corner or category sheet is dismissed', () => {
    expect(
      goalWizardCloseCommit({
        team: 'opponent',
        step: 'corner',
        shotType: null,
        scorerId: null,
        fromCorner: true,
      }),
    ).toEqual({ kind: 'opponent', fromCorner: null })

    expect(
      goalWizardCloseCommit({
        team: 'opponent',
        step: 'type',
        shotType: null,
        scorerId: null,
        fromCorner: false,
      }),
    ).toEqual({ kind: 'opponent', fromCorner: false })
  })

  it('keeps the shot type when the scorer sheet is closed', () => {
    expect(
      goalWizardCloseCommit({
        team: 'us',
        step: 'scorer',
        shotType: 'PK',
        scorerId: null,
        fromCorner: false,
      }),
    ).toEqual({
      kind: 'our',
      scorerId: null,
      assistPlayerId: null,
      shotType: 'PK',
      fromCorner: false,
    })
  })

  it('keeps the scorer and drops the assist when the assist sheet is closed', () => {
    expect(
      goalWizardCloseCommit({
        team: 'us',
        step: 'assist',
        shotType: 'Short-range',
        scorerId: 'p1',
        fromCorner: null,
      }),
    ).toEqual({
      kind: 'our',
      scorerId: 'p1',
      assistPlayerId: null,
      shotType: 'Short-range',
      fromCorner: null,
    })
  })
})
