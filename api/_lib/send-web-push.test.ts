import { describe, expect, it } from 'vitest'
import { LIVE_PUSH_OPTIONS, goalPushTag } from './send-web-push'

describe('goalPushTag', () => {
  it('gives each score in a match its own tag', () => {
    const ours = goalPushTag({
      matchId: 'match-1',
      ourGoal: true,
      homeScore: 1,
      awayScore: 0,
      timestamp: 120,
    })
    const theirs = goalPushTag({
      matchId: 'match-1',
      ourGoal: false,
      homeScore: 1,
      awayScore: 1,
      timestamp: 400,
    })

    expect(ours).toBe('vvfc-goal-match-1-us-1-0-120')
    expect(theirs).toBe('vvfc-goal-match-1-them-1-1-400')
    expect(ours).not.toBe(theirs)
  })

  it('stays unique when the same scoreline is logged at a different time', () => {
    const first = goalPushTag({
      matchId: 'match-1',
      ourGoal: true,
      homeScore: 1,
      awayScore: 0,
      timestamp: 120,
    })
    const again = goalPushTag({
      matchId: 'match-1',
      ourGoal: true,
      homeScore: 1,
      awayScore: 0,
      timestamp: 800,
    })
    expect(first).not.toBe(again)
  })
})

describe('LIVE_PUSH_OPTIONS', () => {
  it('sends live alerts at high urgency with a bounded timeout and no collapse topic', () => {
    expect(LIVE_PUSH_OPTIONS.urgency).toBe('high')
    expect(LIVE_PUSH_OPTIONS.timeout).toBeGreaterThan(0)
    expect(LIVE_PUSH_OPTIONS.timeout).toBeLessThanOrEqual(5_000)
    expect(LIVE_PUSH_OPTIONS.TTL).toBe(60 * 60)
    expect(LIVE_PUSH_OPTIONS).not.toHaveProperty('topic')
  })
})
