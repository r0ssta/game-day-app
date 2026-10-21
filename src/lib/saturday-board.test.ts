import { describe, expect, it } from 'vitest'
import {
  matchBelongsOnSaturdayBoard,
  playersUnderMinutesTarget,
  weekendWindow,
} from './saturday-board'

describe('saturday board', () => {
  it('uses this Saturday when today is midweek, and this weekend on Sunday', () => {
    expect(weekendWindow(new Date(2026, 9, 21, 15, 0, 0))).toEqual({
      start: '2026-10-24',
      end: '2026-10-25',
    })
    expect(weekendWindow(new Date(2026, 9, 25, 9, 0, 0))).toEqual({
      start: '2026-10-24',
      end: '2026-10-25',
    })
  })

  it('keeps a live midweek match on the board', () => {
    const window = { start: '2026-10-24', end: '2026-10-25' }
    expect(
      matchBelongsOnSaturdayBoard({ matchDate: '2026-10-21', status: 'live' }, window),
    ).toBe(true)
    expect(
      matchBelongsOnSaturdayBoard({ matchDate: '2026-10-21', status: 'scheduled' }, window),
    ).toBe(false)
  })

  it('flags players under half of the team’s completed minutes', () => {
    const short = playersUnderMinutesTarget({
      teams: [{ id: 'team-1', name: 'U11 Capybaras', ratio: 0.5 }],
      matches: [
        { id: 'm1', teamId: 'team-1', minutes: 50, status: 'final' },
        { id: 'm2', teamId: 'team-1', minutes: 50, status: 'pending_review' },
      ],
      stats: [
        { matchId: 'm1', playerId: 'p1', seconds: 20 * 60, guest: false },
        { matchId: 'm2', playerId: 'p1', seconds: 20 * 60, guest: false },
        { matchId: 'm1', playerId: 'p2', seconds: 40 * 60, guest: false },
        { matchId: 'm2', playerId: 'p2', seconds: 40 * 60, guest: false },
        { matchId: 'm1', playerId: 'guest', seconds: 50 * 60, guest: true },
      ],
      roster: [
        { playerId: 'p1', teamId: 'team-1', playerName: 'Alex' },
        { playerId: 'p2', teamId: 'team-1', playerName: 'Blair' },
      ],
    })

    expect(short.map((row) => row.playerName)).toEqual(['Alex'])
    expect(short[0]?.playedMinutes).toBe(40)
    expect(short[0]?.targetMinutes).toBe(50)
  })
})