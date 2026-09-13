import { describe, expect, it } from 'vitest'
import {
  coachImpactPath,
  coachMatchPath,
  coachTeamPath,
  isImpactReportPath,
  isLandingPath,
  parseCoachRoute,
} from './app-routes'

describe('isLandingPath', () => {
  it('only matches /waitlist', () => {
    expect(isLandingPath('/waitlist')).toBe(true)
    expect(isLandingPath('/waitlist/')).toBe(true)
  })

  it('leaves coach root, aliases, and Parent Hub alone', () => {
    expect(isLandingPath('/')).toBe(false)
    expect(isLandingPath('')).toBe(false)
    expect(isLandingPath('/coach')).toBe(false)
    expect(isLandingPath('/admin')).toBe(false)
    expect(isLandingPath('/hub/blitz')).toBe(false)
    expect(isLandingPath('/impact')).toBe(false)
    expect(isLandingPath('/index.html')).toBe(false)
  })
})

describe('isImpactReportPath', () => {
  it('matches the staff impact route and the team-scoped alias', () => {
    expect(isImpactReportPath('/impact')).toBe(true)
    expect(isImpactReportPath('/impact/')).toBe(true)
    expect(isImpactReportPath('/coach/teams/team-a/impact')).toBe(true)
    expect(isImpactReportPath('/')).toBe(false)
    expect(isImpactReportPath('/hub/blitz')).toBe(false)
    expect(isImpactReportPath('/waitlist')).toBe(false)
  })
})

describe('parseCoachRoute', () => {
  it('reads team and match ids from the staff session path', () => {
    expect(parseCoachRoute('/')).toEqual({ teamId: null, matchId: null, screen: null })
    expect(parseCoachRoute('/coach/teams/team-a')).toEqual({
      teamId: 'team-a',
      matchId: null,
      screen: 'team',
    })
    expect(parseCoachRoute('/coach/teams/team-a/matches/match-1')).toEqual({
      teamId: 'team-a',
      matchId: 'match-1',
      screen: 'match',
    })
    expect(parseCoachRoute('/coach/teams/team-a/impact')).toEqual({
      teamId: 'team-a',
      matchId: null,
      screen: 'impact',
    })
  })

  it('builds session paths', () => {
    expect(coachTeamPath('team-a')).toBe('/coach/teams/team-a')
    expect(coachMatchPath('team-a', 'match-1')).toBe('/coach/teams/team-a/matches/match-1')
    expect(coachImpactPath('team-a')).toBe('/coach/teams/team-a/impact')
    expect(coachImpactPath()).toBe('/impact')
  })
})
