import { describe, expect, it } from 'vitest'
import { buildGoalPush } from './push-copy'

describe('buildGoalPush', () => {
  it('uses GOAL! copy for our goals', () => {
    const push = buildGoalPush({
      teamName: 'Velocity',
      opponent: 'Rivals',
      homeScore: 1,
      awayScore: 0,
      scorerLabel: '#7 Ada',
      assistLabel: '#10 Bess',
      ourGoal: true,
    })
    expect(push.title).toBe('Velocity · GOAL!')
    expect(push.body).toContain('assist #10 Bess')
    expect(push.body).toContain('1–0')
  })

  it('uses conceded copy for opponent goals, including PKs', () => {
    const push = buildGoalPush({
      teamName: 'Velocity',
      opponent: 'Rivals',
      homeScore: 1,
      awayScore: 1,
      ourGoal: false,
      isPk: true,
    })
    expect(push.title).toBe('Velocity · Goal conceded')
    expect(push.body).toBe('Rivals PK · 1–1')
  })

  it('includes the opponent-goal category in conceded copy', () => {
    const push = buildGoalPush({
      teamName: 'Velocity',
      opponent: 'Rivals',
      homeScore: 0,
      awayScore: 1,
      ourGoal: false,
      eventNotes: 'Caught on the Counter',
    })
    expect(push.body).toBe('Rivals · Caught on the Counter · 0–1')
  })
})
