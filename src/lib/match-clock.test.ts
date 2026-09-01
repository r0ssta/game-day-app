import { describe, expect, it } from 'vitest'
import {
  formatAddedTime,
  formatMatchClockParts,
  persistableClockSeconds,
  restoreMatchClockSeconds,
  tickCountdownClock,
} from './match-clock'

describe('match-clock', () => {
  it('never persists a negative clock_seconds value', () => {
    expect(persistableClockSeconds(-12)).toBe(0)
    expect(persistableClockSeconds(0)).toBe(0)
    expect(persistableClockSeconds(400)).toBe(400)
  })

  it('restores added time as a negative remaining countdown', () => {
    expect(restoreMatchClockSeconds(400, 0)).toBe(400)
    expect(restoreMatchClockSeconds(0, 15)).toBe(-15)
    expect(restoreMatchClockSeconds(0, 0)).toBe(0)
  })

  it('ticks the countdown, including into added time', () => {
    expect(tickCountdownClock(10, 1)).toBe(9)
    expect(tickCountdownClock(1, 1)).toBe(0)
    expect(tickCountdownClock(0, 1)).toBe(-1)
    expect(tickCountdownClock(50, 50)).toBe(0)
  })

  it('formats added time as +M:SS and keeps regulation at 00:00', () => {
    expect(formatAddedTime(10)).toBe('')
    expect(formatAddedTime(0)).toBe('')
    expect(formatAddedTime(-75)).toBe('+1:15')

    const parts = formatMatchClockParts(-75)
    expect(parts.regulation).toBe('00:00')
    expect(parts.addedLabel).toBe('+1:15')
    expect(parts.inAddedTime).toBe(true)
  })
})
