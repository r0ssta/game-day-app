import { expect, test } from '@playwright/test'
import {
  createE2eTestMatch,
  deleteE2eTestMatch,
  staffAccessToken,
  staffE2eSkipReason,
  staffSupabase,
} from './staff-session'

const UNKNOWN_MATCH = '00000000-0000-4000-8000-000000000001'

test.describe('match API authenticated', () => {
  test.beforeAll(() => {
    const reason = staffE2eSkipReason()
    if (reason) test.skip(true, reason)
  })

  test('unknown match → 404', async ({ request }) => {
    const token = await staffAccessToken()
    const response = await request.post('/api/match/log-team-event', {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        matchId: UNKNOWN_MATCH,
        side: 'home',
        eventKind: 'shot',
        timestamp: 12,
        formation: '4-3-3',
      },
    })
    expect(response.status()).toBe(404)
    const body = (await response.json()) as { ok?: boolean }
    expect(body.ok).toBe(false)
  })

  test('invalid payload → 400', async ({ request }) => {
    const token = await staffAccessToken()
    const response = await request.post('/api/match/log-goal', {
      headers: { Authorization: `Bearer ${token}` },
      data: { matchId: UNKNOWN_MATCH, ourGoal: true },
    })
    expect(response.status()).toBe(400)
    const body = (await response.json()) as { ok?: boolean; code?: string }
    expect(body.ok).toBe(false)
    expect(body.code).toBe('validation_error')
  })

  test('shot, opponent goal, and undo last goal round-trip', async ({ request }) => {
    const token = await staffAccessToken()
    const supabase = staffSupabase(token)
    const created = await createE2eTestMatch(supabase)
    if ('skip' in created) {
      test.skip(true, created.skip)
      return
    }

    try {
      const shot = await request.post('/api/match/log-team-event', {
        headers: { Authorization: `Bearer ${token}` },
        data: {
          matchId: created.matchId,
          side: 'away',
          eventKind: 'shot',
          timestamp: 40,
          formation: '4-3-3',
        },
      })
      const shotBody = (await shot.json()) as { ok?: boolean; eventType?: string; error?: string }
      expect(shot.status(), shotBody.error).toBe(200)
      expect(shotBody.ok).toBe(true)
      expect(shotBody.eventType).toBe('shot_away')

      const goal = await request.post('/api/match/log-goal', {
        headers: { Authorization: `Bearer ${token}` },
        data: {
          matchId: created.matchId,
          ourGoal: false,
          isPk: false,
          timestamp: 41,
          formation: '4-3-3',
          homeScoreBefore: 0,
          awayScoreBefore: 0,
          onFieldPlayerIds: [],
          pairAutoShot: false,
        },
      })
      const goalBody = (await goal.json()) as {
        ok?: boolean
        awayScore?: number
        eventType?: string
        error?: string
      }
      expect(goal.status(), goalBody.error).toBe(200)
      expect(goalBody.ok).toBe(true)
      expect(goalBody.awayScore).toBe(1)
      expect(goalBody.eventType).toBe('opponent_goal')

      const undo = await request.post('/api/match/remove-last-goal', {
        headers: { Authorization: `Bearer ${token}` },
        data: { matchId: created.matchId, side: 'away' },
      })
      const undoBody = (await undo.json()) as { ok?: boolean; awayScore?: number; error?: string }
      expect(undo.status(), undoBody.error).toBe(200)
      expect(undoBody.ok).toBe(true)
      expect(undoBody.awayScore).toBe(0)
    } finally {
      await deleteE2eTestMatch(supabase, created.matchId)
    }
  })
})
