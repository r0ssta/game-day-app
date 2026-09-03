import { describe, expect, it } from 'vitest'
import { startingLineupNote } from './match-event-notes'
import {
  buildParentMatchPlayerStats,
  formatParentCountingStats,
  formatParentHalfRole,
  formatParentPositionsLine,
  formatParentTotalRole,
} from './parent-match-stats'
import type { ParentHubPlayer, ParentLiveEvent } from './parent-hub'

const ADA = '11111111-1111-4000-8000-000000000001'
const BESS = '22222222-2222-4000-8000-000000000002'

const players: ParentHubPlayer[] = [
  { id: ADA, firstName: 'Ada', lastName: 'Lovelace', number: 7 },
  { id: BESS, firstName: 'Bess', lastName: 'Coleman', number: 1 },
]

function event(
  partial: Partial<ParentLiveEvent> & Pick<ParentLiveEvent, 'id' | 'eventType'>,
): ParentLiveEvent {
  return {
    matchId: 'm1',
    playerId: ADA,
    playerName: 'Ada',
    jersey: 7,
    timestamp: 0,
    eventNotes: null,
    isPk: false,
    assistPlayerId: null,
    assistPlayerName: null,
    createdAt: '2026-09-02T18:00:00.000Z',
    ...partial,
  }
}

describe('buildParentMatchPlayerStats', () => {
  it('splits minutes, start flags, and positions by half', () => {
    const rows = buildParentMatchPlayerStats(
      [
        event({
          id: 'lu-ada',
          eventType: 'sub_in',
          eventNotes: startingLineupNote('ST'),
          createdAt: '2026-09-02T18:00:00.000Z',
        }),
        event({
          id: 'lu-bess',
          eventType: 'sub_in',
          playerId: BESS,
          playerName: 'Bess',
          jersey: 1,
          eventNotes: startingLineupNote('GK'),
          createdAt: '2026-09-02T18:00:00.050Z',
        }),
        event({
          id: 'move',
          eventType: 'position_change',
          timestamp: 600,
          eventNotes: 'ST→CM',
          createdAt: '2026-09-02T18:10:00.000Z',
        }),
        event({
          id: 'goal',
          eventType: 'goal',
          timestamp: 700,
          assistPlayerId: BESS,
          createdAt: '2026-09-02T18:12:00.000Z',
        }),
        event({
          id: 'end-ada',
          eventType: 'sub_out',
          timestamp: 1800,
          eventNotes: 'period_end',
          createdAt: '2026-09-02T18:30:00.000Z',
        }),
        event({
          id: 'end-bess',
          eventType: 'sub_out',
          playerId: BESS,
          playerName: 'Bess',
          timestamp: 1800,
          eventNotes: 'period_end',
          createdAt: '2026-09-02T18:30:00.050Z',
        }),
        event({
          id: 'lu2-ada',
          eventType: 'sub_in',
          eventNotes: startingLineupNote('CM'),
          createdAt: '2026-09-02T18:40:00.000Z',
        }),
        event({
          id: 'save',
          eventType: 'save_home',
          playerId: BESS,
          playerName: 'Bess',
          timestamp: 120,
          createdAt: '2026-09-02T18:42:00.000Z',
        }),
        event({
          id: 'end2-ada',
          eventType: 'sub_out',
          timestamp: 1800,
          eventNotes: 'period_end',
          createdAt: '2026-09-02T19:10:00.000Z',
        }),
      ],
      'm1',
      30,
      players,
    )

    const ada = rows.find((row) => row.playerId === ADA)!
    const bess = rows.find((row) => row.playerId === BESS)!

    expect(ada.halves[0].started).toBe(true)
    expect(ada.halves[0].seconds).toBe(1800)
    expect(formatParentPositionsLine(ada.halves[0].positions)).toBe('ST 10m, CM 20m')
    expect(ada.halves[0].goals).toBe(1)
    expect(ada.halves[1].started).toBe(true)
    expect(ada.halves[1].seconds).toBe(1800)
    expect(ada.total.seconds).toBe(3600)
    expect(formatParentTotalRole(ada)).toBe('Started both')
    expect(formatParentCountingStats(ada.total)).toBe('G 1')

    expect(bess.halves[0].started).toBe(true)
    expect(bess.halves[0].assists).toBe(1)
    expect(bess.halves[1].started).toBe(false)
    expect(bess.halves[1].saves).toBe(1)
    expect(formatParentHalfRole(bess.halves[1])).toBe('—')
    expect(formatParentCountingStats(bess.halves[1])).toBe('SV 1')
    expect(formatParentPositionsLine(bess.total.positions)).not.toContain('STARTING_LINEUP')
  })

  it('does not invent a 3rd half after a pre-kickoff lineup tweak', () => {
    const rows = buildParentMatchPlayerStats(
      [
        event({
          id: 'lu-ada',
          eventType: 'sub_in',
          eventNotes: startingLineupNote('ST'),
          createdAt: '2026-08-29T18:33:50.000Z',
        }),
        event({
          id: 'lu-bess',
          eventType: 'sub_in',
          playerId: BESS,
          playerName: 'Bess',
          jersey: 1,
          eventNotes: startingLineupNote('GK'),
          createdAt: '2026-08-29T18:33:50.050Z',
        }),
        event({
          id: 'tweak-pos',
          eventType: 'position_change',
          eventNotes: 'CM',
          createdAt: '2026-08-29T18:34:06.000Z',
        }),
        event({
          id: 'tweak-in',
          eventType: 'sub_in',
          playerId: BESS,
          playerName: 'Bess',
          jersey: 1,
          eventNotes: 'CM',
          createdAt: '2026-08-29T18:34:53.000Z',
        }),
        event({
          id: 'tweak-out',
          eventType: 'sub_out',
          eventNotes: null,
          createdAt: '2026-08-29T18:34:53.000Z',
        }),
        event({
          id: 'end1-bess',
          eventType: 'sub_out',
          playerId: BESS,
          playerName: 'Bess',
          timestamp: 2127,
          eventNotes: 'period_end',
          createdAt: '2026-08-29T19:13:32.000Z',
        }),
        event({
          id: 'lu2-bess',
          eventType: 'sub_in',
          playerId: BESS,
          playerName: 'Bess',
          jersey: 1,
          eventNotes: startingLineupNote('GK'),
          createdAt: '2026-08-29T19:22:03.000Z',
        }),
        event({
          id: 'end2-bess',
          eventType: 'sub_out',
          playerId: BESS,
          playerName: 'Bess',
          timestamp: 2197,
          eventNotes: 'period_end',
          createdAt: '2026-08-29T19:58:51.000Z',
        }),
      ],
      'm1',
      40,
      players,
    )

    const bess = rows.find((row) => row.playerId === BESS)!
    expect(bess.extraHalves).toEqual([])
    expect(bess.halves[0].started).toBe(true)
    expect(bess.halves[0].seconds).toBe(2127)
    expect(bess.halves[1].started).toBe(true)
    expect(bess.halves[1].seconds).toBe(2197)
    expect(bess.total.seconds).toBe(4324)
    expect(formatParentTotalRole(bess)).toBe('Started both')
  })
})
