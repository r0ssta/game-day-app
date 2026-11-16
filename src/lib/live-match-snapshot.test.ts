import { describe, expect, it } from 'vitest'
import { getLiveSecondsPlayed } from '@/lib/play-time'
import {
  CLOCK_ADOPT_DRIFT_SECONDS,
  CLOCK_ECHO_MS,
  isMatchClockHeartbeatUpdate,
  isStaleKickoffSnapshot,
  mergeRemoteLivePlayers,
  mergeRemotePlayerOverlays,
  shouldAdoptRemoteClock,
  shouldAdoptRemotePreKickoffLineup,
  shouldHoldLocalLiveClock,
} from './live-match-snapshot'
import type { MatchPlayer } from '@/types/match'

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

describe('isMatchClockHeartbeatUpdate', () => {
  it('ignores updates that only change the clock when old has score columns', () => {
    expect(
      isMatchClockHeartbeatUpdate(
        { id: 'm', home_score: 1, away_score: 0, clock_seconds: 400 },
        { id: 'm', home_score: 1, away_score: 0, clock_seconds: 405 },
      ),
    ).toBe(true)
  })

  it('does not ignore a concurrent score change', () => {
    expect(
      isMatchClockHeartbeatUpdate(
        { id: 'm', home_score: 2, away_score: 0, clock_seconds: 400 },
        { id: 'm', home_score: 1, away_score: 0, clock_seconds: 405 },
      ),
    ).toBe(false)
  })

  it('does not ignore PK-only old rows (default replica identity)', () => {
    expect(
      isMatchClockHeartbeatUpdate(
        { id: 'm', home_score: 1, clock_seconds: 400 },
        { id: 'm' },
      ),
    ).toBe(false)
  })
})

describe('mergeRemotePlayerOverlays', () => {
  const player = (overrides: Partial<MatchPlayer> & { id: string }): MatchPlayer => ({
    teamId: 't1',
    number: 7,
    firstName: 'A',
    lastName: 'B',
    position: 'ST',
    primaryPosition: 'ST',
    secondaryPosition: 'CM',
    ageGroup: 'U13',
    isGuest: false,
    activeStatus: true,
    impact: 'neutral',
    attending: true,
    isFirstHalfStarter: true,
    isSecondHalfStarter: false,
    isOnField: true,
    matchPosition: 'ST',
    totalSecondsPlayed: 0,
    subbedInAt: null,
    plusMinus: 0,
    yellowCardCount: 0,
    isSentOff: false,
    ...overrides,
  })

  it('copies cards and plus/minus without moving the local player', () => {
    const local = [player({ id: 'p1', isOnField: true, matchPosition: 'ST', plusMinus: 0 })]
    const remote = [
      player({
        id: 'p1',
        isOnField: false,
        matchPosition: 'CM',
        yellowCardCount: 1,
        plusMinus: 1,
      }),
    ]
    const merged = mergeRemotePlayerOverlays(local, remote)
    expect(merged[0]?.isOnField).toBe(true)
    expect(merged[0]?.matchPosition).toBe('ST')
    expect(merged[0]?.yellowCardCount).toBe(1)
    expect(merged[0]?.plusMinus).toBe(1)
  })

  it('pulls a player off the pitch when another device marks them out', () => {
    const local = [player({ id: 'p1', isOnField: true, attending: true })]
    const remote = [
      player({
        id: 'p1',
        attending: false,
        isOnField: false,
        absenceReason: 'injured',
      }),
    ]
    const merged = mergeRemotePlayerOverlays(local, remote)
    expect(merged[0]).toMatchObject({
      attending: false,
      isOnField: false,
      absenceReason: 'injured',
    })
  })
})

describe('mergeRemoteLivePlayers', () => {
  const half = 25 * 60
  const player = (overrides: Partial<MatchPlayer> & { id: string }): MatchPlayer => ({
    teamId: 't1',
    number: 7,
    firstName: 'A',
    lastName: 'B',
    position: 'ST',
    primaryPosition: 'ST',
    secondaryPosition: 'CM',
    ageGroup: 'U13',
    isGuest: false,
    activeStatus: true,
    impact: 'neutral',
    attending: true,
    isFirstHalfStarter: true,
    isSecondHalfStarter: false,
    isOnField: true,
    matchPosition: 'ST',
    totalSecondsPlayed: 0,
    subbedInAt: null,
    plusMinus: 0,
    yellowCardCount: 0,
    isSentOff: false,
    ...overrides,
  })

  it('adopts the other coach’s sub and banked minutes', () => {
    const local = [
      player({ id: 'p1', isOnField: true, matchPosition: 'ST', subbedInAt: half, totalSecondsPlayed: 0 }),
      player({ id: 'p2', isOnField: false, matchPosition: 'CM', subbedInAt: null, totalSecondsPlayed: 0 }),
    ]
    const remote = [
      player({
        id: 'p1',
        isOnField: false,
        matchPosition: 'ST',
        subbedInAt: null,
        totalSecondsPlayed: 600,
        fieldSecondsPlayed: 600,
        gkSecondsPlayed: 0,
      }),
      player({
        id: 'p2',
        isOnField: true,
        matchPosition: 'ST',
        subbedInAt: half - 600,
        totalSecondsPlayed: 0,
      }),
    ]

    const merged = mergeRemoteLivePlayers(local, remote, { periodStartRemaining: half })
    expect(merged[0]).toMatchObject({ isOnField: false, totalSecondsPlayed: 600, subbedInAt: null })
    expect(merged[1]).toMatchObject({ isOnField: true, matchPosition: 'ST', subbedInAt: half - 600 })
    expect(getLiveSecondsPlayed(merged[1]!, half - 700)).toBe(100)
  })

  it('counts an unstamped on-field player from the period start instead of 0:00', () => {
    const local = [
      player({ id: 'p1', isOnField: true, subbedInAt: null, totalSecondsPlayed: 0 }),
    ]
    const remote = [
      player({ id: 'p1', isOnField: true, subbedInAt: null, totalSecondsPlayed: 0 }),
    ]
    const merged = mergeRemoteLivePlayers(local, remote, { periodStartRemaining: half })
    const remaining = half - 8 * 60
    expect(merged[0]?.subbedInAt).toBe(half)
    expect(getLiveSecondsPlayed(merged[0]!, remaining)).toBe(8 * 60)
  })

  it('keeps a local open stint when the snapshot has not stored the anchor yet', () => {
    const local = [
      player({ id: 'p1', isOnField: true, subbedInAt: 900, totalSecondsPlayed: 400 }),
    ]
    const remote = [
      player({ id: 'p1', isOnField: true, subbedInAt: null, totalSecondsPlayed: 400 }),
    ]
    const merged = mergeRemoteLivePlayers(local, remote, { periodStartRemaining: half })
    expect(merged).toBe(local)
    expect(getLiveSecondsPlayed(merged[0]!, 800)).toBe(500)
  })

  it('adds a player who only exists on the other coach’s snapshot', () => {
    const local = [player({ id: 'p1', isOnField: true, subbedInAt: half })]
    const remote = [
      player({ id: 'p1', isOnField: true, subbedInAt: half }),
      player({ id: 'guest', isOnField: false, isGuest: true, totalSecondsPlayed: 120 }),
    ]
    const merged = mergeRemoteLivePlayers(local, remote, { periodStartRemaining: half })
    expect(merged.map((row) => row.id)).toEqual(['p1', 'guest'])
    expect(merged[1]?.totalSecondsPlayed).toBe(120)
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

  it('does not adopt a remote 0:00 over a ready-to-start countdown', () => {
    expect(
      shouldAdoptRemoteClock({
        ...base,
        localSeconds: 1500,
        remoteSeconds: 0,
        remoteClockStarted: false,
        localClockStarted: false,
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
