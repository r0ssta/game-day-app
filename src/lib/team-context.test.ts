import { describe, expect, it } from 'vitest'
import {
  resolveCoachRouteTeam,
  resolveCoachSessionTeamId,
  teamsForSelector,
} from './team-context'

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

describe('resolveCoachRouteTeam', () => {
  const teams = [
    { id: 'team-a', active_status: true },
    { id: 'team-b', active_status: true },
    { id: 'team-archived', active_status: false },
  ]

  it('does not fall back when the URL team is unknown', () => {
    expect(
      resolveCoachRouteTeam({
        routeTeamId: 'missing-team',
        teams,
        persistedTeamId: 'team-a',
      }),
    ).toEqual({
      unknownRouteTeamId: 'missing-team',
      selectedTeamId: null,
      fallbackTeamId: 'team-a',
    })
  })

  it('keeps a known URL team even when it is archived', () => {
    expect(
      resolveCoachRouteTeam({
        routeTeamId: 'team-archived',
        teams,
        persistedTeamId: 'team-a',
      }),
    ).toEqual({
      unknownRouteTeamId: null,
      selectedTeamId: 'team-archived',
      fallbackTeamId: 'team-a',
    })
  })

  it('falls back to the last-used team only when the URL has no team', () => {
    expect(
      resolveCoachRouteTeam({
        routeTeamId: null,
        teams,
        persistedTeamId: 'team-b',
      }),
    ).toEqual({
      unknownRouteTeamId: null,
      selectedTeamId: 'team-b',
      fallbackTeamId: 'team-b',
    })
  })
})

describe('teamsForSelector', () => {
  it('keeps only teams for the current club when clubId is set', () => {
    const options = teamsForSelector(
      [
        { id: 'vv', name: 'Maroon', activeStatus: true, clubId: 'club-vv' },
        { id: 'demo', name: 'Demo', activeStatus: true, clubId: 'club-demo' },
      ],
      { clubId: 'club-demo' },
    )
    expect(options).toEqual([
      { id: 'demo', name: 'Demo', clubId: 'club-demo', accessRole: null },
    ])
  })
})
