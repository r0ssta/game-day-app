import { describe, expect, it } from 'vitest'
import {
  aggregateTeamBoxScoreTotals,
  reconcileSavesFromShots,
  unpairedShotImpliesSave,
} from './match-shot-save'

describe('reconcileSavesFromShots', () => {
  it('fills saves from shots that did not become goals', () => {
    expect(
      reconcileSavesFromShots({
        homeShots: 21,
        awayShots: 0,
        homeSaves: 0,
        awaySaves: 0,
        homeCorners: 10,
        awayCorners: 0,
        homeGoals: 8,
        awayGoals: 0,
      }),
    ).toMatchObject({ homeSaves: 0, awaySaves: 13 })
  })

  it('keeps explicit saves when they are higher than the shot identity', () => {
    expect(
      reconcileSavesFromShots({
        homeShots: 2,
        awayShots: 1,
        homeSaves: 4,
        awaySaves: 0,
        homeCorners: 0,
        awayCorners: 0,
        homeGoals: 1,
        awayGoals: 0,
      }),
    ).toMatchObject({ homeSaves: 4, awaySaves: 1 })
  })
})

describe('aggregateTeamBoxScoreTotals', () => {
  it('infers opponent saves from unpaired home shots', () => {
    const totals = aggregateTeamBoxScoreTotals([
      { event_type: 'shot_home' },
      { event_type: 'shot_home' },
      { event_type: 'shot_home' },
      { event_type: 'goal' },
      { event_type: 'shot_away' },
      { event_type: 'opponent_goal' },
    ])
    expect(totals).toMatchObject({
      homeShots: 3,
      awayShots: 1,
      homeGoals: 1,
      awayGoals: 1,
      homeSaves: 0,
      awaySaves: 2,
    })
  })
})

describe('unpairedShotImpliesSave', () => {
  it('is false when the shot is already paired with a goal or save', () => {
    const events = [
      { eventType: 'shot_away', timestamp: 10 },
      { eventType: 'opponent_goal', timestamp: 10 },
      { eventType: 'shot_away', timestamp: 20 },
      { eventType: 'save_home', timestamp: 20 },
      { eventType: 'shot_away', timestamp: 30 },
    ]
    expect(unpairedShotImpliesSave(events, events[0]!)).toBe(false)
    expect(unpairedShotImpliesSave(events, events[2]!)).toBe(false)
    expect(unpairedShotImpliesSave(events, events[4]!)).toBe(true)
  })
})
