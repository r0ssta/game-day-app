import { describe, expect, it } from 'vitest'
import {
  clampHalfLengthMinutes,
  elapsedFromHalfStart,
  elapsedInHalf,
  formatAddedTime,
  formatMatchClockParts,
  halfStartTimeFromRemaining,
  persistableClockSeconds,
  planHalfLengthOverride,
  remainingAfterHalfLengthChange,
  remainingFromHalfStart,
  resolvePeriodKickoffRemaining,
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

  it('restores a leftover 0:00 clock to a full period at kickoff', () => {
    expect(resolvePeriodKickoffRemaining(0, 25)).toBe(25 * 60)
    expect(resolvePeriodKickoffRemaining(-12, 25)).toBe(25 * 60)
    expect(resolvePeriodKickoffRemaining(2000, 25)).toBe(25 * 60)
    expect(resolvePeriodKickoffRemaining(12 * 60, 25)).toBe(12 * 60)
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

  it('clamps half-length overrides to a coach-safe range', () => {
    expect(clampHalfLengthMinutes(0)).toBe(5)
    expect(clampHalfLengthMinutes(30.4)).toBe(30)
    expect(clampHalfLengthMinutes(120)).toBe(90)
  })

  it('derives remaining from now vs half start without resetting elapsed', () => {
    const halfStart = 1_000_000
    const tenMinutesLater = halfStart + 10 * 60 * 1000

    expect(elapsedFromHalfStart(halfStart, tenMinutesLater)).toBe(600)
    expect(remainingFromHalfStart(halfStart, 25, tenMinutesLater)).toBe(15 * 60)
    expect(remainingFromHalfStart(halfStart, 30, tenMinutesLater)).toBe(20 * 60)
    expect(elapsedInHalf(20 * 60, 30)).toBe(600)
  })

  it('rebuilds half_start_time from the current remaining countdown', () => {
    const now = 5_000_000
    const start = halfStartTimeFromRemaining(12 * 60, 25, now)
    expect(remainingFromHalfStart(start, 25, now)).toBe(12 * 60)
  })

  it('preserves elapsed when half length changes mid-period', () => {
    expect(remainingAfterHalfLengthChange(15 * 60, 25, 30)).toBe(20 * 60)
    expect(remainingAfterHalfLengthChange(-120, 25, 30)).toBe(3 * 60)
    expect(remainingAfterHalfLengthChange(3 * 60, 25, 20)).toBe(-2 * 60)
  })

  it('plans a mid-match override from the half start timestamp', () => {
    const halfStart = 2_000_000
    const now = halfStart + 8 * 60 * 1000
    const planned = planHalfLengthOverride({
      nextMinutes: 35,
      previousMinutes: 25,
      remainingSeconds: 17 * 60,
      halfStartTimeMs: halfStart,
      nowMs: now,
      periodClockStarted: true,
    })

    expect(planned.nextMinutes).toBe(35)
    expect(planned.nextRemaining).toBe(27 * 60)
    expect(planned.halfStartTimeMs).toBe(halfStart)
  })

  it('resets the face clock when the period has not started', () => {
    const planned = planHalfLengthOverride({
      nextMinutes: 40,
      previousMinutes: 25,
      remainingSeconds: 25 * 60,
      halfStartTimeMs: null,
      nowMs: 0,
      periodClockStarted: false,
    })

    expect(planned.nextRemaining).toBe(40 * 60)
    expect(planned.halfStartTimeMs).toBeNull()
  })
})
