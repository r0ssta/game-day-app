import { describe, expect, it } from 'vitest'
import type { MatchPlayer } from '@/types/match'
import {
  applyKickoffSlotLineup,
  applySubstitution,
  formatPlayingTimeBadge,
  freezeFirstHalfStarters,
  getLiveSecondsPlayed,
  stampAllOnField,
} from './play-time'

const FIELD = '11111111-1111-4000-8000-000000000001'
const BENCH = '22222222-2222-4000-8000-000000000002'

function player(partial: Partial<MatchPlayer> & Pick<MatchPlayer, 'id'>): MatchPlayer {
  return {
    teamId: 't',
    number: 8,
    firstName: 'Test',
    lastName: 'Player',
    position: 'CM',
    primaryPosition: 'CM',
    secondaryPosition: 'CAM',
    ageGroup: 'U13',
    isGuest: false,
    activeStatus: true,
    impact: 'neutral',
    attending: true,
    isFirstHalfStarter: false,
    isSecondHalfStarter: false,
    isOnField: false,
    matchPosition: 'CM',
    totalSecondsPlayed: 0,
    subbedInAt: null,
    plusMinus: 0,
    yellowCardCount: 0,
    isSentOff: false,
    ...partial,
  }
}

describe('play-time', () => {
  it('freezes first-half starters from whoever is actually on the pitch', () => {
    const players = [
      player({ id: FIELD, attending: true, isOnField: true }),
      player({ id: BENCH, attending: true, isOnField: false, isFirstHalfStarter: true }),
    ]
    const frozen = freezeFirstHalfStarters(players)
    expect(frozen.find((row) => row.id === FIELD)?.isFirstHalfStarter).toBe(true)
    expect(frozen.find((row) => row.id === BENCH)?.isFirstHalfStarter).toBe(false)
  })

  it('stamps on-field players at kickoff and banks stint time on a swap', () => {
    const kickedOff = stampAllOnField(
      [
        player({ id: FIELD, isOnField: true }),
        player({ id: BENCH, isOnField: false }),
      ],
      1800,
    )
    expect(kickedOff.find((row) => row.id === FIELD)?.subbedInAt).toBe(1800)

    const after = applySubstitution(kickedOff, BENCH, FIELD, 1500)
    const off = after.find((row) => row.id === FIELD)
    const on = after.find((row) => row.id === BENCH)
    expect(off?.isOnField).toBe(false)
    expect(off?.totalSecondsPlayed).toBe(300)
    expect(off?.subbedInAt).toBeNull()
    expect(on?.isOnField).toBe(true)
    expect(on?.subbedInAt).toBe(1500)
    expect(getLiveSecondsPlayed(on!, 1200)).toBe(300)
  })

  it('uses the current pitch slots as the kickoff XI', () => {
    const linedUp = applyKickoffSlotLineup(
      [
        player({ id: FIELD, isOnField: false, matchPosition: 'CM' }),
        player({ id: BENCH, isOnField: true, matchPosition: 'ST', isFirstHalfStarter: true }),
      ],
      { gk: FIELD },
      '2-3-1',
      undefined,
      '7v7',
    )
    expect(linedUp.find((row) => row.id === FIELD)).toMatchObject({
      isOnField: true,
      matchPosition: 'GK',
    })
    expect(linedUp.find((row) => row.id === BENCH)?.isOnField).toBe(false)
  })

  it('formats playing time as whole minutes', () => {
    expect(formatPlayingTimeBadge(0)).toBe('0m')
    expect(formatPlayingTimeBadge(59)).toBe('0m')
    expect(formatPlayingTimeBadge(180)).toBe('3m')
  })
})
