import { describe, expect, it } from 'vitest'
import {
  isAwaitingKickoff,
  isExtraTimeStatus,
  isLiveMatchStatus,
  isParentVisibleLive,
  isSessionInProgressMatchForSelectedTeam,
  MATCH_STATUS,
  parentFacingMatchStatus,
} from './match-status'

describe('match-status', () => {
  it('treats extra time and penalty shootout as in-progress', () => {
    expect(isLiveMatchStatus('live')).toBe(true)
    expect(isLiveMatchStatus('extra_time_first_half')).toBe(true)
    expect(isLiveMatchStatus('extra_time_second_half')).toBe(true)
    expect(isLiveMatchStatus('penalty_shootout')).toBe(true)
    expect(isLiveMatchStatus('pending_review')).toBe(false)
    expect(isExtraTimeStatus(MATCH_STATUS.extraTimeFirstHalf)).toBe(true)
  })

  it('keeps a ready screen scheduled until the half starts', () => {
    const ready = {
      status: 'live',
      period_clock_started: false,
      current_period: 1,
      period: '1st',
      home_score: 0,
      away_score: 0,
      clock_seconds: 2100,
      half_length: 35,
      period_length: 35,
    }
    expect(isAwaitingKickoff(ready)).toBe(true)
    expect(isParentVisibleLive(ready)).toBe(false)
    expect(parentFacingMatchStatus(ready)).toBe('scheduled')
    expect(isParentVisibleLive({ ...ready, period_clock_started: true })).toBe(true)
    expect(isAwaitingKickoff({ ...ready, clock_seconds: 0 })).toBe(false)
    expect(isAwaitingKickoff({ ...ready, period: '2nd' })).toBe(false)
    expect(isAwaitingKickoff({ ...ready, home_score: 1 })).toBe(false)
    expect(isAwaitingKickoff({ ...ready, status: 'scheduled' })).toBe(false)
  })

  it('scopes in-progress matches to the selected team', () => {
    expect(
      isSessionInProgressMatchForSelectedTeam(
        'penalty_shootout',
        'match-1',
        'team-a',
        'team-a',
      ),
    ).toBe(true)
    expect(
      isSessionInProgressMatchForSelectedTeam('live', 'match-1', 'team-a', 'team-b'),
    ).toBe(false)
  })
})
