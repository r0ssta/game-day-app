import { expect, test } from '@playwright/test'
import {
  skipUnlessStaffE2e,
  staffAccessToken,
  staffE2eSkipReason,
} from './staff-session'

const UNKNOWN_MATCH = '00000000-0000-4000-8000-000000000001'

test.describe('match API authenticated', () => {
  test.beforeAll(() => {
    const reason = staffE2eSkipReason()
    if (reason) skipUnlessStaffE2e(test, reason)
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
})
