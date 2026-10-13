import { describe, expect, it } from 'vitest'
import {
  countsAsGamePlayed,
  emptyPlayerSeasonStats,
  formatRoleSplit,
  refreshPlayingTimeAverages,
} from './season-reporting'

describe('playing time report', () => {
  it('leaves injured and absent games out of the games-played count', () => {
    expect(countsAsGamePlayed({ attending: false, total_seconds_played: 0 })).toBe(false)
    expect(countsAsGamePlayed({ attending: false, total_seconds_played: null })).toBe(false)
    expect(countsAsGamePlayed({ attending: true, total_seconds_played: 0 })).toBe(true)
    expect(countsAsGamePlayed({ attending: false, total_seconds_played: 480 })).toBe(true)
  })

  it('averages each half and the match over games played, not games missed', () => {
    const entry = emptyPlayerSeasonStats('p1')
    entry.matchesPlayed = 2
    entry.totalMinutes = 3000
    entry.firstHalfSeconds = 1800
    entry.secondHalfSeconds = 1200
    entry.firstHalfStarts = 2
    entry.secondHalfStarts = 1
    entry.fieldSeconds = 2100
    entry.gkSeconds = 900

    refreshPlayingTimeAverages(entry)

    expect(entry.averageMinutesPerMatch).toBe(1500)
    expect(entry.averageFirstHalfSeconds).toBe(900)
    expect(entry.averageSecondHalfSeconds).toBe(600)
    expect(entry.fieldPercent).toBe(70)
    expect(entry.gkPercent).toBe(30)
    expect(formatRoleSplit(entry.fieldPercent, entry.gkPercent)).toBe('Field 70% · GK 30%')
  })

  it('labels a full-time goalkeeper and a player with no tracked minutes', () => {
    expect(formatRoleSplit(0, 100)).toBe('GK 100%')
    expect(formatRoleSplit(100, 0)).toBe('Field 100%')
    expect(formatRoleSplit(null, null)).toBe('—')
  })
})
