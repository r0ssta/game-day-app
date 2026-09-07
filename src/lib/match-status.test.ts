import { describe, expect, it } from 'vitest'
import {
  isExtraTimeStatus,
  isLiveMatchStatus,
  isSessionInProgressMatchForSelectedTeam,
  MATCH_STATUS,
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
