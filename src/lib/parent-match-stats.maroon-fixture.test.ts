import { describe, expect, it } from 'vitest'
import { startingLineupNote } from './match-event-notes'
import {
  buildParentMatchPlayerStats,
  formatParentHalfRole,
} from './parent-match-stats'
import type { ParentHubPlayer, ParentLiveEvent } from './parent-hub'

/**
 * Mirrors Maroon second-half event timestamps: each half restarts at 0.
 * A first-half starter who sits the opening of the second half, then comes on,
 * must still get non-zero 2H minutes.
 */
describe('parent match stats with per-period clocks', () => {
  const ADA = '11111111-1111-4000-8000-000000000001'
  const BESS = '22222222-2222-4000-8000-000000000002'
  const players: ParentHubPlayer[] = [
    { id: ADA, firstName: 'Ada', lastName: 'Lovelace', number: 7 },
    { id: BESS, firstName: 'Bess', lastName: 'Coleman', number: 10 },
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
      createdAt: '2026-11-21T18:00:00.000Z',
      ...partial,
    }
  }

  it('credits second-half minutes for a sub when half clocks restart at 0', () => {
    const rows = buildParentMatchPlayerStats(
      [
        event({
          id: 'h1-ada',
          eventType: 'sub_in',
          eventNotes: startingLineupNote('ST'),
          createdAt: '2026-11-21T18:00:00.000Z',
        }),
        event({
          id: 'h1-bess',
          eventType: 'sub_in',
          playerId: BESS,
          playerName: 'Bess',
          jersey: 10,
          eventNotes: startingLineupNote('CM'),
          createdAt: '2026-11-21T18:00:00.050Z',
        }),
        event({
          id: 'h1-end-ada',
          eventType: 'sub_out',
          timestamp: 2100,
          eventNotes: 'period_end',
          createdAt: '2026-11-21T18:35:00.000Z',
        }),
        event({
          id: 'h1-end-bess',
          eventType: 'sub_out',
          playerId: BESS,
          playerName: 'Bess',
          timestamp: 2100,
          eventNotes: 'period_end',
          createdAt: '2026-11-21T18:35:00.050Z',
        }),
        event({
          id: 'h2-ada',
          eventType: 'sub_in',
          eventNotes: startingLineupNote('ST'),
          createdAt: '2026-11-21T18:45:00.000Z',
        }),
        event({
          id: 'h2-sub-bess',
          eventType: 'sub_in',
          playerId: BESS,
          playerName: 'Bess',
          jersey: 10,
          timestamp: 600,
          eventNotes: 'CM',
          createdAt: '2026-11-21T18:55:00.000Z',
        }),
        event({
          id: 'h2-end-ada',
          eventType: 'sub_out',
          timestamp: 2100,
          eventNotes: 'period_end',
          createdAt: '2026-11-21T19:20:00.000Z',
        }),
        event({
          id: 'h2-end-bess',
          eventType: 'sub_out',
          playerId: BESS,
          playerName: 'Bess',
          timestamp: 2100,
          eventNotes: 'period_end',
          createdAt: '2026-11-21T19:20:00.050Z',
        }),
      ],
      'm1',
      35,
      players,
    )

    const ada = rows.find((row) => row.playerId === ADA)!
    const bess = rows.find((row) => row.playerId === BESS)!

    expect(ada.halves[0].seconds).toBe(2100)
    expect(ada.halves[1].seconds).toBe(2100)
    expect(bess.halves[0].seconds).toBe(2100)
    expect(bess.halves[1].seconds).toBe(1500)
    expect(bess.halves[1].started).toBe(false)
    expect(formatParentHalfRole(bess.halves[1])).toBe('Came on')
  })
})
