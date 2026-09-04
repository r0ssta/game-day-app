import { describe, expect, it } from 'vitest'
import { startingLineupNote } from './match-event-notes'
import {
  assignParentEventPeriodIndexes,
  buildParentTimelineRows,
  formatParentEventLine,
  formatParentHubWallClock,
  formatParentPeriodEndedLabel,
  formatParentTimelineRowCopy,
  hidePairedParentShots,
  isParentHubStaffPreviewRequest,
  isParentTimelineHighlight,
  parentLiveEventsFromMatchEvents,
  type ParentLiveEvent,
} from './parent-hub'

function event(partial: Partial<ParentLiveEvent> & Pick<ParentLiveEvent, 'id' | 'eventType'>): ParentLiveEvent {
  return {
    matchId: 'm1',
    playerId: 'p1',
    playerName: 'Ada',
    jersey: 7,
    timestamp: 120,
    eventNotes: null,
    isPk: false,
    assistPlayerId: null,
    assistPlayerName: null,
    createdAt: '2026-09-02T18:00:00.000Z',
    ...partial,
  }
}

describe('isParentHubStaffPreviewRequest', () => {
  it('is true only for preview=1', () => {
    expect(isParentHubStaffPreviewRequest('?preview=1')).toBe(true)
    expect(isParentHubStaffPreviewRequest('?preview=true')).toBe(false)
    expect(isParentHubStaffPreviewRequest('')).toBe(false)
  })
})

describe('formatParentHubWallClock', () => {
  it('formats created_at in Eastern time', () => {
    expect(formatParentHubWallClock('2026-09-02T18:00:00.000Z')).toBe('2:00 PM')
    expect(formatParentHubWallClock('2026-01-15T18:00:00.000Z')).toBe('1:00 PM')
  })
})

describe('formatParentEventLine', () => {
  const names = { teamName: 'U11 Blitz', periodIndex: 1 }
  const clock = ' · 2:00 PM'

  it('uses team names instead of home/away', () => {
    expect(formatParentEventLine(event({ id: 's', eventType: 'shot_home' }), 'Rivals', names)).toBe(
      `1H 2' Shot · U11 Blitz${clock}`,
    )
    expect(formatParentEventLine(event({ id: 's', eventType: 'shot_away' }), 'Rivals', names)).toBe(
      `1H 2' Shot · Rivals${clock}`,
    )
    expect(formatParentEventLine(event({ id: 'c', eventType: 'corner_home' }), 'Rivals', names)).toBe(
      `1H 2' Corner · U11 Blitz${clock}`,
    )
  })

  it('credits a known home goalkeeper and uses team name otherwise', () => {
    expect(
      formatParentEventLine(
        event({ id: 'sv', eventType: 'save_home', playerName: 'Maya' }),
        'test1',
        names,
      ),
    ).toBe(`1H 2' Shot by test1, Save by Maya${clock}`)
    expect(
      formatParentEventLine(event({ id: 'sv', eventType: 'save_home', playerName: null }), 'test1', names),
    ).toBe(`1H 2' Save by U11 Blitz${clock}`)
    expect(formatParentEventLine(event({ id: 'sv', eventType: 'save_away' }), 'Rivals', names)).toBe(
      `1H 2' Save by Rivals${clock}`,
    )
  })

  it('includes the position on a sub in', () => {
    expect(
      formatParentEventLine(event({ id: 'in', eventType: 'sub_in', eventNotes: 'ST' }), 'Rivals', names),
    ).toBe(`1H 2' Sub ON · Ada · ST${clock}`)
  })

  it('includes an opponent-goal category when present', () => {
    expect(
      formatParentEventLine(
        event({
          id: 'og',
          eventType: 'opponent_goal',
          eventNotes: 'Unforced Error',
        }),
        'Rivals',
        names,
      ),
    ).toBe(`1H 2' Rivals Goal · Unforced Error${clock}`)
  })

  it('keeps legacy PK copy when an opponent goal has no category', () => {
    expect(
      formatParentEventLine(
        event({ id: 'og', eventType: 'opponent_goal', isPk: true }),
        'Rivals',
        names,
      ),
    ).toBe(`1H 2' Rivals Goal (PK)${clock}`)
  })

  it('capitalizes Assist by on a goal', () => {
    expect(
      formatParentEventLine(
        event({
          id: 'g',
          eventType: 'goal',
          assistPlayerName: 'Bess',
        }),
        'Rivals',
        names,
      ),
    ).toBe(`1H 2' GOAL · Ada · Assist by Bess${clock}`)
  })
})

describe('hidePairedParentShots', () => {
  it('hides the auto-shot next to a goal or a save', () => {
    const rows = hidePairedParentShots([
      event({ id: 'shot-g', eventType: 'shot_home', timestamp: 90 }),
      event({ id: 'goal', eventType: 'goal', timestamp: 90 }),
      event({ id: 'shot-sv', eventType: 'shot_away', timestamp: 150 }),
      event({ id: 'save', eventType: 'save_home', timestamp: 150 }),
      event({ id: 'solo', eventType: 'shot_home', timestamp: 200 }),
    ])
    expect(rows.map((row) => row.id)).toEqual(['goal', 'save', 'solo'])
  })
})

describe('buildParentTimelineRows', () => {
  it('emits a half-ended card from period_end sub-offs even before full time', () => {
    const rows = buildParentTimelineRows(
      [
        event({
          id: 'lu',
          eventType: 'sub_in',
          timestamp: 0,
          eventNotes: startingLineupNote('GK'),
          createdAt: '2026-09-02T18:00:00.000Z',
        }),
        event({
          id: 'end-1',
          eventType: 'sub_out',
          timestamp: 400,
          eventNotes: 'period_end',
          createdAt: '2026-09-02T18:10:00.000Z',
        }),
        event({
          id: 'end-2',
          eventType: 'sub_out',
          timestamp: 400,
          eventNotes: 'period_end',
          createdAt: '2026-09-02T18:10:00.100Z',
          playerId: 'p2',
          playerName: 'Bess',
        }),
      ],
      { totalPeriods: 2 },
    )

    expect(rows.some((row) => row.kind === 'period_end' && row.label === '1st half ended')).toBe(
      true,
    )
    expect(rows.some((row) => row.kind === 'event' && row.event.eventType === 'sub_out')).toBe(
      false,
    )
    expect(rows.some((row) => row.kind === 'lineup')).toBe(true)
  })

  it('still shows half ended when the whistle is at 0 elapsed seconds', () => {
    const rows = buildParentTimelineRows(
      [
        event({
          id: 'end-early',
          eventType: 'sub_out',
          timestamp: 0,
          eventNotes: 'period_end',
          createdAt: '2026-09-02T18:01:00.000Z',
        }),
      ],
      { totalPeriods: 2 },
    )
    expect(rows.map((row) => row.kind)).toEqual(['period_end'])
    expect(rows[0]).toMatchObject({ label: '1st half ended' })
  })

  it('collapses a two-player positional swap into one line', () => {
    const rows = buildParentTimelineRows([
      event({
        id: 'sw-1',
        eventType: 'position_change',
        eventNotes: 'LCM→ST',
        playerName: 'Ada',
        createdAt: '2026-09-02T18:00:00.000Z',
      }),
      event({
        id: 'sw-2',
        eventType: 'position_change',
        eventNotes: 'ST→LCM',
        playerId: 'p2',
        playerName: 'Bess',
        createdAt: '2026-09-02T18:00:00.200Z',
      }),
    ])
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      kind: 'switch',
      label: 'Switched Position: Ada LCM ST and Bess ST LCM',
    })
    expect(formatParentTimelineRowCopy(rows[0]!, 'Rivals').title).toBe(
      '1H Switched Position: Ada LCM ST and Bess ST LCM · 2:00 PM',
    )
  })

  it('prefixes first-half lineup and highlights kickoff, goals, and half end', () => {
    const rows = buildParentTimelineRows(
      [
        event({
          id: 'lu',
          eventType: 'sub_in',
          timestamp: 0,
          eventNotes: startingLineupNote('GK'),
          createdAt: '2026-09-02T18:00:00.000Z',
        }),
        event({
          id: 'g',
          eventType: 'goal',
          timestamp: 90,
          createdAt: '2026-09-02T18:02:00.000Z',
        }),
        event({
          id: 'end',
          eventType: 'sub_out',
          timestamp: 400,
          eventNotes: 'period_end',
          createdAt: '2026-09-02T18:10:00.000Z',
        }),
      ],
      { totalPeriods: 2 },
    )
    const lineup = rows.find((row) => row.kind === 'lineup')!
    const goal = rows.find((row) => row.kind === 'event')!
    const ended = rows.find((row) => row.kind === 'period_end')!
    expect(formatParentTimelineRowCopy(lineup, 'Rivals').title).toBe('1H lineup · 2:00 PM')
    expect(formatParentTimelineRowCopy(ended, 'Rivals').title).toBe('1H 1st half ended · 2:10 PM')
    expect(isParentTimelineHighlight(lineup)).toBe(true)
    expect(isParentTimelineHighlight(goal)).toBe(true)
    expect(isParentTimelineHighlight(ended)).toBe(true)
  })
})

describe('assignParentEventPeriodIndexes', () => {
  it('keeps pre-kickoff slot tweaks in 1H so 2nd-half kickoff is 2H, not 3H', () => {
    const periodById = assignParentEventPeriodIndexes([
      event({
        id: 'lu1',
        eventType: 'sub_in',
        timestamp: 0,
        eventNotes: startingLineupNote('ST'),
        createdAt: '2026-08-29T18:33:50.000Z',
      }),
      event({
        id: 'pos',
        eventType: 'position_change',
        timestamp: 0,
        eventNotes: 'CM',
        createdAt: '2026-08-29T18:34:06.000Z',
      }),
      event({
        id: 'tweak',
        eventType: 'sub_in',
        timestamp: 0,
        eventNotes: 'CM',
        createdAt: '2026-08-29T18:34:53.000Z',
      }),
      event({
        id: 'goal',
        eventType: 'goal',
        timestamp: 101,
        createdAt: '2026-08-29T18:39:13.000Z',
      }),
      event({
        id: 'end1',
        eventType: 'sub_out',
        timestamp: 2127,
        eventNotes: 'period_end',
        createdAt: '2026-08-29T19:13:32.000Z',
      }),
      event({
        id: 'lu2',
        eventType: 'sub_in',
        timestamp: 0,
        eventNotes: startingLineupNote('GK'),
        createdAt: '2026-08-29T19:22:03.000Z',
      }),
    ])

    expect(periodById.get('lu1')).toBe(1)
    expect(periodById.get('tweak')).toBe(1)
    expect(periodById.get('goal')).toBe(1)
    expect(periodById.get('end1')).toBe(1)
    expect(periodById.get('lu2')).toBe(2)
  })

  it('still advances on a legacy untagged 2nd-half kickoff', () => {
    const periodById = assignParentEventPeriodIndexes([
      event({
        id: 'lu1',
        eventType: 'sub_in',
        timestamp: 0,
        eventNotes: 'ST',
        createdAt: '2026-08-29T18:00:00.000Z',
      }),
      event({
        id: 'end1',
        eventType: 'sub_out',
        timestamp: 1800,
        eventNotes: 'period_end',
        createdAt: '2026-08-29T18:30:00.000Z',
      }),
      event({
        id: 'lu2',
        eventType: 'sub_in',
        timestamp: 0,
        eventNotes: 'CM',
        createdAt: '2026-08-29T18:40:00.000Z',
      }),
    ])

    expect(periodById.get('lu1')).toBe(1)
    expect(periodById.get('end1')).toBe(1)
    expect(periodById.get('lu2')).toBe(2)
  })
})

describe('formatParentPeriodEndedLabel', () => {
  it('uses half copy for 2-period matches', () => {
    expect(formatParentPeriodEndedLabel(1, 2)).toBe('1st half ended')
    expect(formatParentPeriodEndedLabel(2, 2)).toBe('2nd half ended')
  })
})

describe('parentLiveEventsFromMatchEvents', () => {
  it('maps staff match events onto the Parent Hub feed shape', () => {
    const rows = parentLiveEventsFromMatchEvents(
      [
        {
          id: 'g1',
          match_id: 'm1',
          player_id: 'p1',
          event_type: 'goal',
          timestamp: 90,
          event_notes: null,
          assist_player_id: 'p2',
          is_pk: false,
          created_at: '2026-09-02T18:00:00.000Z',
        },
        {
          id: 'noise',
          match_id: 'm1',
          player_id: 'p1',
          event_type: 'formation_change',
          timestamp: 40,
          event_notes: '4-3-3',
          assist_player_id: null,
          created_at: '2026-09-02T18:00:01.000Z',
        },
      ],
      [
        { id: 'p1', firstName: 'Ada', lastName: 'Lovelace', number: 7 },
        { id: 'p2', firstName: 'Bess', lastName: 'Coleman', number: 10 },
      ],
    )
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      eventType: 'goal',
      playerName: 'Ada Lovelace',
      assistPlayerName: 'Bess Coleman',
      jersey: 7,
    })
  })
})
