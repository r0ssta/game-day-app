import { describe, expect, it } from 'vitest'
import {
  formatPlayingTimeBarLabel,
  maxPlayingTimeSeconds,
  playingTimeBarPercents,
} from './playing-time-bar'

describe('playing-time-bar helpers', () => {
  it('formats field and GK minutes with role markers', () => {
    expect(formatPlayingTimeBarLabel(0, 0)).toBe('0m')
    expect(formatPlayingTimeBarLabel(35 * 60, 0)).toBe('35m 👟')
    expect(formatPlayingTimeBarLabel(0, 15 * 60)).toBe('15m 🧤')
    expect(formatPlayingTimeBarLabel(35 * 60, 15 * 60)).toBe('35m 👟 | 15m 🧤')
  })

  it('scales segments against the longest player', () => {
    expect(playingTimeBarPercents(2100, 900, 3000)).toEqual({ fieldPct: 70, gkPct: 30 })
    expect(playingTimeBarPercents(1500, 0, 3000)).toEqual({ fieldPct: 50, gkPct: 0 })
  })

  it('uses the longest combined time as the bar scale', () => {
    expect(
      maxPlayingTimeSeconds([
        { total_field_seconds: 2100, total_gk_seconds: 900 },
        { total_field_seconds: 1200, total_gk_seconds: 0 },
      ]),
    ).toBe(3000)
  })
})
