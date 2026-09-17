import { describe, expect, it } from 'vitest'
import {
  ADMIN_ACTIVITY_PATH,
  CHANGELOG_PATH,
  coachImpactPath,
  coachMatchPath,
  coachTeamPath,
  isAdminActivityPath,
  isChangelogPath,
  isImpactReportPath,
  isLandingPath,
  parseCoachRoute,
  shouldCanonicalizeActiveTeamPath,
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
    expect(isLandingPath('/changelog')).toBe(false)
    expect(isLandingPath('/index.html')).toBe(false)
  })
})

describe('isChangelogPath', () => {
  it('only matches /changelog', () => {
    expect(isChangelogPath('/changelog')).toBe(true)
    expect(isChangelogPath('/changelog/')).toBe(true)
    expect(isChangelogPath(CHANGELOG_PATH)).toBe(true)
    expect(isChangelogPath('/')).toBe(false)
    expect(isChangelogPath('/waitlist')).toBe(false)
    expect(isChangelogPath('/coach')).toBe(false)
  })
})

describe('isAdminActivityPath', () => {
  it('only matches /admin/activity', () => {
    expect(isAdminActivityPath('/admin/activity')).toBe(true)
    expect(isAdminActivityPath('/admin/activity/')).toBe(true)
    expect(isAdminActivityPath(ADMIN_ACTIVITY_PATH)).toBe(true)
    expect(isAdminActivityPath('/admin')).toBe(false)
    expect(isAdminActivityPath('/')).toBe(false)
    expect(isAdminActivityPath('/changelog')).toBe(false)
  })
})

describe('shouldCanonicalizeActiveTeamPath', () => {
  it('fills a bare staff root with the last-used team', () => {
    expect(shouldCanonicalizeActiveTeamPath('/')).toBe(true)
    expect(shouldCanonicalizeActiveTeamPath('/coach')).toBe(true)
  })

  it('leaves team sessions, impact, and public pages alone', () => {
    expect(shouldCanonicalizeActiveTeamPath('/coach/teams/team-a')).toBe(false)
    expect(shouldCanonicalizeActiveTeamPath('/impact')).toBe(false)
    expect(shouldCanonicalizeActiveTeamPath('/changelog')).toBe(false)
    expect(shouldCanonicalizeActiveTeamPath('/waitlist')).toBe(false)
    expect(shouldCanonicalizeActiveTeamPath('/admin/activity')).toBe(false)
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
