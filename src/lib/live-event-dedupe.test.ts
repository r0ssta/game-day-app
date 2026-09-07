import { afterEach, describe, expect, it } from 'vitest'
import {
  COACH_LIVE_EVENT_DEDUPE_MS,
  liveEventDedupeKey,
  resetLiveEventDedupeForTests,
  shouldAcceptLiveEvent,
} from './live-event-dedupe'

describe('shouldAcceptLiveEvent', () => {
  afterEach(() => {
    resetLiveEventDedupeForTests()
  })

  it('accepts the first tap and drops a repeat inside the 15s window', () => {
    const key = liveEventDedupeKey(['goal', 'match-1', 'home'])
    expect(shouldAcceptLiveEvent(key, 1_000)).toBe(true)
    expect(shouldAcceptLiveEvent(key, 1_000 + COACH_LIVE_EVENT_DEDUPE_MS - 1)).toBe(
      false,
    )
    expect(shouldAcceptLiveEvent(key, 1_000 + COACH_LIVE_EVENT_DEDUPE_MS)).toBe(true)
  })

  it('does not collide across event types or sides', () => {
    expect(shouldAcceptLiveEvent(liveEventDedupeKey(['goal', 'm', 'home']), 5_000)).toBe(
      true,
    )
    expect(shouldAcceptLiveEvent(liveEventDedupeKey(['goal', 'm', 'away']), 5_000)).toBe(
      true,
    )
    expect(shouldAcceptLiveEvent(liveEventDedupeKey(['shot', 'm', 'home']), 5_000)).toBe(
      true,
    )
  })
})
