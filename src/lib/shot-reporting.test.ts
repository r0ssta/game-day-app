import { describe, expect, it } from 'vitest'
import { formatPlayerShotScore, formatPlayerShots, summarizeMatchShots } from './shot-reporting'

describe('summarizeMatchShots', () => {
  it('splits tagged types and credits our shooter once, including a shot they saved', () => {
    const summary = summarizeMatchShots([
      { eventType: 'shot_home', eventNotes: 'Short-range', playerId: null, playerName: null },
      { eventType: 'shot_away', eventNotes: 'Free Kick', playerId: null, playerName: null },
      { eventType: 'shot_away', eventNotes: 'Long-range', playerId: null, playerName: null },
      {
        eventType: 'save_away',
        eventNotes: 'PK',
        playerId: 'brooks',
        playerName: 'Brooks Gilmore',
      },
      {
        eventType: 'shot_home',
        eventNotes: 'PK',
        playerId: 'brooks',
        playerName: 'Brooks Gilmore',
      },
      { eventType: 'save_home', eventNotes: 'Long-range', playerId: 'nico', playerName: 'Nico' },
      { eventType: 'shot_home', eventNotes: null, playerId: 'ada', playerName: 'Ada' },
    ])

    expect(summary.shotTypes).toEqual([
      { type: 'Free Kick', us: 0, them: 1 },
      { type: 'PK', us: 1, them: 0 },
      { type: 'Short-range', us: 1, them: 0 },
      { type: 'Long-range', us: 0, them: 1 },
    ])
    expect(summary.playerShots).toEqual([
      { playerId: 'ada', name: 'Ada', shots: 1, detail: '' },
      { playerId: 'brooks', name: 'Brooks Gilmore', shots: 1, detail: '1 PK' },
    ])
  })

  it('formats a player line with types when they were tagged', () => {
    expect(formatPlayerShots(2, { PK: 1, 'Short-range': 1 })).toBe(
      'Shots 2 · 1 PK · 1 Short-range',
    )
    expect(formatPlayerShots(1, {})).toBe('Shots 1')
    expect(formatPlayerShots(0, { PK: 1 })).toBe('')
    expect(formatPlayerShotScore(1, '1 PK')).toBe('1 PK')
    expect(formatPlayerShotScore(2, '1 PK')).toBe('2 · 1 PK')
    expect(formatPlayerShotScore(1, '')).toBe('1')
  })
})
