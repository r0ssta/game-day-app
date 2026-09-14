import { describe, expect, it } from 'vitest'
import type { DbPlayerImpact } from '@/types/database'
import {
  differentialTone,
  formatImpactDifferential,
  formatImpactMinutes,
  formatImpactWpi,
  sortPlayerImpact,
} from './player-impact'

function row(partial: Partial<DbPlayerImpact> & Pick<DbPlayerImpact, 'player_id'>): DbPlayerImpact {
  return {
    first_name: 'Ada',
    last_name: 'Lovelace',
    jersey: 10,
    team_id: 'team-1',
    team_name: 'U13 Blitz',
    matches_played: 4,
    total_seconds_played: 3600,
    total_field_seconds: 3600,
    total_gk_seconds: 0,
    team_goals: 3,
    opponent_goals: 1,
    goal_plus_minus: 2,
    team_shots: 8,
    opponent_shots: 5,
    net_shot_differential: 3,
    team_corners: 2,
    opponent_corners: 1,
    net_corner_differential: 1,
    gk_goals_conceded: 0,
    gk_saves: 0,
    offensive_performance_index: 8,
    defensive_performance_index: -5,
    weighted_performance_index: 3,
    ...partial,
  }
}

describe('player-impact helpers', () => {
  it('formats minutes without a trailing :00', () => {
    expect(formatImpactMinutes(0)).toBe('0')
    expect(formatImpactMinutes(3600)).toBe('60')
    expect(formatImpactMinutes(90)).toBe('1:30')
  })

  it('formats differentials with a leading plus', () => {
    expect(formatImpactDifferential(2)).toBe('+2')
    expect(formatImpactDifferential(0)).toBe('0')
    expect(formatImpactDifferential(-3)).toBe('-3')
  })

  it('maps differentials to pill tones', () => {
    expect(differentialTone(1)).toBe('positive')
    expect(differentialTone(0)).toBe('neutral')
    expect(differentialTone(-1)).toBe('negative')
  })

  it('sorts by goal +/-, then name', () => {
    const rows = [
      row({ player_id: 'b', first_name: 'Bea', last_name: 'Beta', goal_plus_minus: 1 }),
      row({ player_id: 'a', first_name: 'Ada', last_name: 'Alpha', goal_plus_minus: 4 }),
      row({ player_id: 'c', first_name: 'Cara', last_name: 'Alpha', goal_plus_minus: 4 }),
    ]
    expect(sortPlayerImpact(rows, 'goal_plus_minus').map((item) => item.player_id)).toEqual([
      'a',
      'c',
      'b',
    ])
  })

  it('formats WPI with a leading plus and one decimal when needed', () => {
    expect(formatImpactWpi(15)).toBe('+15')
    expect(formatImpactWpi(4.5)).toBe('+4.5')
    expect(formatImpactWpi(0)).toBe('0')
    expect(formatImpactWpi(-2.5)).toBe('-2.5')
  })

  it('sorts by WPI when requested', () => {
    const rows = [
      row({ player_id: 'b', weighted_performance_index: 4 }),
      row({ player_id: 'a', first_name: 'Ada', last_name: 'Alpha', weighted_performance_index: 12 }),
    ]
    expect(
      sortPlayerImpact(rows, 'weighted_performance_index').map((item) => item.player_id),
    ).toEqual(['a', 'b'])
  })

  it('sorts by offense when requested', () => {
    const rows = [
      row({ player_id: 'b', offensive_performance_index: 4 }),
      row({ player_id: 'a', first_name: 'Ada', last_name: 'Alpha', offensive_performance_index: 12 }),
    ]
    expect(
      sortPlayerImpact(rows, 'offensive_performance_index').map((item) => item.player_id),
    ).toEqual(['a', 'b'])
  })

  it('sorts minutes ascending when requested', () => {
    const rows = [
      row({ player_id: 'long', total_seconds_played: 4000 }),
      row({ player_id: 'short', total_seconds_played: 120 }),
    ]
    expect(
      sortPlayerImpact(rows, 'total_seconds_played', 'asc').map((item) => item.player_id),
    ).toEqual(['short', 'long'])
  })
})
