import { describe, expect, it } from 'vitest'
import { resolveCoachSessionTeamId } from './team-context'

describe('resolveCoachSessionTeamId', () => {
  const teams = [
    { id: 'team-a', active_status: true },
    { id: 'team-b', active_status: true },
    { id: 'team-archived', active_status: false },
  ]

  it('prefers the URL team over the last-used hint', () => {
    expect(
      resolveCoachSessionTeamId({
        routeTeamId: 'team-b',
        teams,
        persistedTeamId: 'team-a',
      }),
    ).toBe('team-b')
  })

  it('falls back to the last-used hint only when the URL has no team', () => {
    expect(
      resolveCoachSessionTeamId({
        routeTeamId: null,
        teams,
        persistedTeamId: 'team-b',
      }),
    ).toBe('team-b')
  })

  it('ignores archived teams unless nothing else is selectable', () => {
    expect(
      resolveCoachSessionTeamId({
        routeTeamId: 'team-archived',
        teams,
        persistedTeamId: null,
      }),
    ).toBe('team-a')
  })
})
