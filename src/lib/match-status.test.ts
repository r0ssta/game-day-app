import { describe, expect, it } from 'vitest'
import { isSessionMatchForSelectedTeam } from './match-status'

describe('isSessionMatchForSelectedTeam', () => {
  it('is true only when the live session match belongs to the selected team', () => {
    expect(
      isSessionMatchForSelectedTeam('live', 'm1', 'blitz', 'blitz', 'live'),
    ).toBe(true)
    expect(
      isSessionMatchForSelectedTeam('live', 'm1', 'maroon', 'blitz', 'live'),
    ).toBe(false)
    expect(
      isSessionMatchForSelectedTeam('live', 'm1', 'blitz', null, 'live'),
    ).toBe(false)
    expect(
      isSessionMatchForSelectedTeam('pending_review', 'm1', 'blitz', 'blitz', 'live'),
    ).toBe(false)
  })
})
