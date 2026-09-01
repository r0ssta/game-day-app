import { expect, test } from '@playwright/test'

const MATCH_ROUTES = [
  '/api/match/log-team-event',
  '/api/match/log-goal',
  '/api/match/log-card',
  '/api/match/log-substitution',
  '/api/match/log-formation',
  '/api/match/log-period',
  '/api/match/log-pk-attempt',
  '/api/match/end-regulation',
  '/api/match/finalize-pk',
  '/api/match/finalize-review',
  '/api/match/remove-last-goal',
] as const

const VALID_UUID = '00000000-0000-4000-8000-000000000001'

/** Production allows 20 writes / 10s per IP. Unauth contract bursts may 429 first. */
async function expectAuthOrRateLimited(
  response: { status: () => number; json: () => Promise<unknown> },
  path: string,
  errorPattern: RegExp,
) {
  const status = response.status()
  expect([401, 429], path).toContain(status)
  const body = (await response.json()) as { ok?: boolean; error?: string; code?: string }
  expect(body.ok).toBe(false)
  if (status === 429) {
    expect(body.code, path).toBe('rate_limited')
    return
  }
  expect(String(body.error || '').toLowerCase()).toMatch(errorPattern)
}

test.describe('match API contracts', () => {
  for (const path of MATCH_ROUTES) {
    test(`${path} without Authorization → 401`, async ({ request }) => {
      const response = await request.post(path, {
        data: { matchId: VALID_UUID },
      })
      await expectAuthOrRateLimited(response, path, /auth/)
    })

    test(`${path} with fake Bearer → 401`, async ({ request }) => {
      const response = await request.post(path, {
        headers: { Authorization: 'Bearer not-a-real-token' },
        data: { matchId: VALID_UUID },
      })
      await expectAuthOrRateLimited(response, path, /session|auth/)
    })

    test(`${path} GET → 405`, async ({ request }) => {
      const response = await request.get(path)
      expect(response.status(), path).toBe(405)
      const body = (await response.json()) as { ok?: boolean }
      expect(body.ok).toBe(false)
    })
  }

  test('log-team-event OPTIONS preflight succeeds', async ({ request }) => {
    const response = await request.fetch('/api/match/log-team-event', {
      method: 'OPTIONS',
    })
    expect([200, 204]).toContain(response.status())
  })

  test('unknown match action → 404', async ({ request }) => {
    const response = await request.post('/api/match/not-a-real-action', {
      data: { matchId: VALID_UUID },
    })
    expect(response.status()).toBe(404)
    const body = (await response.json()) as { ok?: boolean; error?: string }
    expect(body.ok).toBe(false)
    expect(String(body.error || '')).toMatch(/unknown match action/i)
  })
})
