import { describe, expect, it } from 'vitest'
import {
  CLOCK_ADOPT_DRIFT_SECONDS,
  CLOCK_ECHO_MS,
  isStaleKickoffSnapshot,
  shouldAdoptRemoteClock,
  shouldAdoptRemotePreKickoffLineup,
  shouldHoldLocalLiveClock,
} from './live-match-snapshot'

describe('isStaleKickoffSnapshot', () => {
  it('treats an empty remote pitch as stale after this device kicked off', () => {
    expect(
      isStaleKickoffSnapshot({
        localClockStarted: true,
        localOnFieldCount: 9,
        remoteOnFieldCount: 0,
      }),
    ).toBe(true)
  })

  it('is not stale when the remote snapshot has players on the field', () => {
    expect(
      isStaleKickoffSnapshot({
        localClockStarted: true,
        localOnFieldCount: 9,
        remoteOnFieldCount: 9,
      }),
    ).toBe(false)
  })
})

describe('shouldHoldLocalLiveClock', () => {
  it('holds when this device owns the clock or is on the live tick', () => {
    expect(
      shouldHoldLocalLiveClock({
        clockOwned: true,
        appMode: 'match',
        periodClockStarted: false,
        running: false,
      }),
    ).toBe(true)
    expect(
      shouldHoldLocalLiveClock({
        clockOwned: false,
        appMode: 'halftime',
        periodClockStarted: false,
        running: false,
      }),
    ).toBe(true)
    expect(
      shouldHoldLocalLiveClock({
        clockOwned: false,
        appMode: 'match',
        periodClockStarted: true,
        running: false,
      }),
    ).toBe(true)
  })

  it('does not hold on the home screen', () => {
    expect(
      shouldHoldLocalLiveClock({
        clockOwned: false,
        appMode: 'home',
        periodClockStarted: false,
        running: false,
      }),
    ).toBe(false)
  })
})

describe('shouldAdoptRemotePreKickoffLineup', () => {
  it('adopts the scheduled XI before kickoff when the coach has not edited', () => {
    expect(
      shouldAdoptRemotePreKickoffLineup({
        localRunning: false,
        periodClockStarted: false,
        lineupDraftLocked: false,
      }),
    ).toBe(true)
  })

  it('keeps the local draft after a ready-to-start slot edit', () => {
    expect(
      shouldAdoptRemotePreKickoffLineup({
        localRunning: false,
        periodClockStarted: false,
        lineupDraftLocked: true,
      }),
    ).toBe(false)
  })

  it('does not adopt a pre-kickoff snapshot once the period clock is running', () => {
    expect(
      shouldAdoptRemotePreKickoffLineup({
        localRunning: false,
        periodClockStarted: true,
        lineupDraftLocked: false,
      }),
    ).toBe(false)
  })
})

describe('shouldAdoptRemoteClock', () => {
  const base = {
    localSeconds: 500,
    remoteSeconds: 490,
    localClockWrittenAtMs: 0,
    nowMs: 20_000,
    remoteClockStarted: true,
    localClockStarted: true,
    localRunning: false,
  }

  it('never adopts while this device is ticking', () => {
    expect(shouldAdoptRemoteClock({ ...base, localRunning: true })).toBe(false)
  })

  it('ignores remote snapshots inside the heartbeat echo window', () => {
    expect(
      shouldAdoptRemoteClock({
        ...base,
        localClockWrittenAtMs: 10_000,
        nowMs: 10_000 + CLOCK_ECHO_MS - 1,
      }),
    ).toBe(false)
  })

  it('adopts when remote is ahead of local by more than the drift threshold', () => {
    expect(
      shouldAdoptRemoteClock({
        ...base,
        localSeconds: 500,
        remoteSeconds: 500 - CLOCK_ADOPT_DRIFT_SECONDS - 1,
      }),
    ).toBe(true)
    expect(
      shouldAdoptRemoteClock({
        ...base,
        localSeconds: 500,
        remoteSeconds: 499,
      }),
    ).toBe(false)
  })

  it('keeps local countdown when remote has not started the period', () => {
    expect(
      shouldAdoptRemoteClock({
        ...base,
        localClockStarted: true,
        remoteClockStarted: false,
      }),
    ).toBe(false)
  })
})
