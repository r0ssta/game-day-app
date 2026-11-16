import { describe, expect, it } from 'vitest'
import {
  buildClubHubSearch,
  clubTeamDisplayName,
  coachRoleLabel,
  normalizeParentClubHub,
  recordLabel,
  scoreboardMatchToParentHubMatch,
} from './parent-club-hub'

describe('parent club hub', () => {
  it('normalizes a club hub payload', () => {
    const hub = normalizeParentClubHub({
      kind: 'club',
      clubId: 'c1',
      clubSlug: 'virginia-velocity',
      clubName: 'Virginia Velocity',
      seasonId: 's1',
      seasonName: 'Fall 2026',
      weekendStart: '2026-11-14',
      weekendEnd: '2026-11-15',
      seasons: [{ id: 's1', name: 'Fall 2026', status: 'active', startsOn: null, endsOn: null }],
      teams: [
        {
          id: 't1',
          slug: 'blitz',
          name: 'Blitz',
          ageGroup: 'U11',
          brandColor: null,
          logoUrl: null,
          wins: 2,
          losses: 1,
          draws: 0,
          goalsFor: 5,
          goalsAgainst: 3,
          matchesPlayed: 3,
        },
      ],
      weekendMatches: [],
      liveNowMatches: [],
    })
    expect(hub.clubSlug).toBe('virginia-velocity')
    expect(hub.teams[0]?.slug).toBe('blitz')
    expect(recordLabel(hub.teams[0]!)).toBe('2-1-0')
    expect(clubTeamDisplayName(hub.teams[0]!)).toContain('Blitz')
  })

  it('builds club hub search omitting default scoreboard/weekend', () => {
    expect(
      buildClubHubSearch({
        tab: 'scoreboard',
        weekendStart: '2026-11-14',
        currentWeekend: { start: '2026-11-14', end: '2026-11-15' },
      }),
    ).toBe('')
    expect(
      buildClubHubSearch({
        tab: 'teams',
        seasonId: 's1',
        teamSlug: 'blitz',
      }),
    ).toBe('?tab=teams&season=s1&team=blitz')
  })

  it('labels coach roles', () => {
    expect(coachRoleLabel('head_coach')).toBe('Head coach')
    expect(coachRoleLabel('assistant_coach')).toBe('Assistant coach')
  })

  it('keeps half length when opening a scoreboard match recap', () => {
    const match = scoreboardMatchToParentHubMatch({
      id: 'm1',
      teamId: 't1',
      teamSlug: 'blitz',
      teamName: 'Blitz',
      ageGroup: 'U11',
      opponent: 'Legacy',
      status: 'pending_review',
      matchDate: '2026-11-15',
      matchTime: '13:00:00',
      date: null,
      locationType: 'away',
      homeScore: 0,
      awayScore: 0,
      homePkScore: 0,
      awayPkScore: 0,
      pkWinnerIsUs: null,
      period: 'second_half',
      currentPeriod: 2,
      totalPeriods: 2,
      periodLength: 35,
      halfLength: 35,
      periodClockStarted: false,
      clockSeconds: 0,
      parentFacingRecap: null,
    })
    expect(match.half_length).toBe(35)
    expect(match.period_length).toBe(35)
    expect(match.total_periods).toBe(2)
  })
})
