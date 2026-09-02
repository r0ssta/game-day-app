import { describe, expect, it } from 'vitest'
import { startingLineupNote } from './match-event-notes'
import {
  buildParentTimelineRows,
  formatParentEventLine,
  formatParentPeriodEndedLabel,
  hidePairedParentShots,
  isParentHubStaffPreviewRequest,
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

describe('formatParentEventLine', () => {
  const names = { teamName: 'U11 Blitz', periodIndex: 1 }

  it('uses team names instead of home/away', () => {
    expect(formatParentEventLine(event({ id: 's', eventType: 'shot_home' }), 'Rivals', names)).toBe(
      "2' Shot · U11 Blitz",
    )
    expect(formatParentEventLine(event({ id: 's', eventType: 'shot_away' }), 'Rivals', names)).toBe(
      "2' Shot · Rivals",
    )
    expect(formatParentEventLine(event({ id: 'c', eventType: 'corner_home' }), 'Rivals', names)).toBe(
      "2' Corner · U11 Blitz",
    )
  })

  it('combines a save with the shooting team', () => {
    expect(formatParentEventLine(event({ id: 'sv', eventType: 'save_home' }), 'Rivals', names)).toBe(
      "2' Shot by Rivals, save",
    )
    expect(formatParentEventLine(event({ id: 'sv', eventType: 'save_away' }), 'Rivals', names)).toBe(
      "2' Shot by U11 Blitz, save",
    )
  })

  it('includes the position on a sub in and a positional move', () => {
    expect(
      formatParentEventLine(event({ id: 'in', eventType: 'sub_in', eventNotes: 'ST' }), 'Rivals', names),
    ).toBe("2' Sub ON · Ada · ST")
    expect(
      formatParentEventLine(
        event({ id: 'mv', eventType: 'position_change', eventNotes: 'LCM' }),
        'Rivals',
        names,
      ),
    ).toBe("2' Position · Ada · LCM")
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
})

describe('formatParentPeriodEndedLabel', () => {
  it('uses half copy for 2-period matches', () => {
    expect(formatParentPeriodEndedLabel(1, 2)).toBe('1st half ended')
    expect(formatParentPeriodEndedLabel(2, 2)).toBe('2nd half ended')
  })
})
