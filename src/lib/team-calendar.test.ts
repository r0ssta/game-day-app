import { describe, expect, it } from 'vitest'
import { buildTeamCalendarIcs, calendarWebcalUrl } from './team-calendar'

describe('team calendar', () => {
  it('marks postponed fixtures tentative and cancelled fixtures cancelled', () => {
    const ics = buildTeamCalendarIcs({
      teamName: 'U11 Capybaras',
      teamSlug: 'u11-capybaras',
      ageGroup: 'U11',
      events: [
        {
          id: '11111111-1111-4111-8111-111111111111',
          opponent: 'Richmond',
          status: 'postponed',
          matchDate: '2026-10-24',
          matchTime: '09:00:00',
          date: '2026-10-24T13:00:00.000Z',
          locationType: 'away',
          placeName: 'Field 4',
          placeDetails: 'Park by the pool',
          arrivalNote: 'Arrive 40 minutes early',
          periodLength: 25,
          totalPeriods: 2,
          halfLength: 25,
        },
        {
          id: '22222222-2222-4222-8222-222222222222',
          opponent: 'Legacy',
          status: 'cancelled',
          matchDate: '2026-10-25',
          matchTime: '11:30',
          date: null,
          locationType: 'home',
          placeName: null,
          placeDetails: null,
          arrivalNote: null,
          periodLength: 30,
          totalPeriods: 2,
          halfLength: 30,
        },
      ],
    })

    expect(ics).toContain('STATUS:TENTATIVE')
    expect(ics).toContain('STATUS:CANCELLED')
    expect(ics).toContain('DTSTART:20261024T090000')
    expect(ics).toContain('DTEND:20261024T095000')
    expect(ics).toContain('LOCATION:Field 4')
    expect(ics).toContain('Arrive 40 minutes early')
  })

  it('builds a webcal subscribe link from the https feed', () => {
    expect(calendarWebcalUrl('https://game.example', 'u11-capybaras')).toBe(
      'webcal://game.example/api/calendar/u11-capybaras',
    )
  })
})
