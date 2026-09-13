import { describe, expect, it } from 'vitest'
import {
  isPositionMicroShift,
  mergePositionSwitchNote,
  POSITION_MICRO_SHIFT_SECONDS,
  positionSwitchNote,
} from './match-event-notes'

describe('mergePositionSwitchNote', () => {
  it('erases a pass-through slot and keeps the original origin', () => {
    expect(mergePositionSwitchNote('LCM→ST', 'CM')).toBe('LCM→CM')
  })

  it('rewrites a bare destination to the final slot', () => {
    expect(mergePositionSwitchNote('ST', 'CM')).toBe('CM')
  })

  it('returns the origin alone when the player is dragged back', () => {
    expect(mergePositionSwitchNote('LCM→ST', 'LCM')).toBe('LCM')
  })

  it('matches a fresh positionSwitchNote when there is no previous stint', () => {
    expect(mergePositionSwitchNote(null, 'ST')).toBe(positionSwitchNote(null, 'ST'))
  })
})

describe('isPositionMicroShift', () => {
  it('merges when match-clock delta is under 20 seconds', () => {
    expect(
      isPositionMicroShift({
        previousTimestamp: 100,
        incomingTimestamp: 119,
      }),
    ).toBe(true)
  })

  it('does not merge a later intentional move on match clock', () => {
    expect(
      isPositionMicroShift({
        previousTimestamp: 100,
        incomingTimestamp: 100 + POSITION_MICRO_SHIFT_SECONDS,
      }),
    ).toBe(false)
  })

  it('merges a wall-clock shuffle even when match timestamps wrap a period', () => {
    expect(
      isPositionMicroShift({
        previousTimestamp: 1200,
        incomingTimestamp: 5,
        previousCreatedAtMs: 1_000,
        nowMs: 1_000 + 8_000,
      }),
    ).toBe(true)
  })

  it('does not merge across a half when wall-clock is also outside the window', () => {
    expect(
      isPositionMicroShift({
        previousTimestamp: 1200,
        incomingTimestamp: 5,
        previousCreatedAtMs: 1_000,
        nowMs: 1_000 + 60_000,
      }),
    ).toBe(false)
  })
})
