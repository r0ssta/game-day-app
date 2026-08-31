import { expect, test } from '@playwright/test'
import {
  EndRegulationInputSchema,
  FinalizeReviewInputSchema,
  LogCardInputSchema,
  LogGoalInputSchema,
  LogSubstitutionInputSchema,
  LogTeamEventInputSchema,
} from '../src/schemas/match-actions'

const MATCH_ROUTES = [
  '/api/match/log-team-event',
  '/api/match/log-goal',
  '/api/match/log-card',
  '/api/match/log-substitution',
  '/api/match/end-regulation',
  '/api/match/finalize-review',
] as const

const VALID_UUID = '00000000-0000-4000-8000-000000000001'

test.describe('match API contracts', () => {
  for (const path of MATCH_ROUTES) {
    test(`${path} without Authorization → 401`, async ({ request }) => {
      const response = await request.post(path, {
        data: { matchId: VALID_UUID },
      })
      expect(response.status(), path).toBe(401)
      const body = (await response.json()) as { ok?: boolean; error?: string }
      expect(body.ok).toBe(false)
      expect(String(body.error || '').toLowerCase()).toMatch(/auth/)
    })

    test(`${path} with fake Bearer → 401`, async ({ request }) => {
      const response = await request.post(path, {
        headers: { Authorization: 'Bearer not-a-real-token' },
        data: { matchId: VALID_UUID },
      })
      expect(response.status(), path).toBe(401)
      const body = (await response.json()) as { ok?: boolean; error?: string }
      expect(body.ok).toBe(false)
      expect(String(body.error || '').toLowerCase()).toMatch(/session|auth/)
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
})

test.describe('match action Zod schemas', () => {
  test('LogTeamEventInputSchema rejects missing fields', () => {
    const parsed = LogTeamEventInputSchema.safeParse({
      matchId: 'not-a-uuid',
      side: 'left',
      eventKind: 'goal',
    })
    expect(parsed.success).toBe(false)
  })

  test('LogTeamEventInputSchema accepts a valid shot payload', () => {
    const parsed = LogTeamEventInputSchema.safeParse({
      matchId: VALID_UUID,
      side: 'home',
      eventKind: 'shot',
      timestamp: 12,
      formation: '4-3-3',
      pairAutoShot: false,
    })
    expect(parsed.success).toBe(true)
  })

  test('LogGoalInputSchema requires scorerId for our goals', () => {
    const parsed = LogGoalInputSchema.safeParse({
      matchId: VALID_UUID,
      ourGoal: true,
      isPk: false,
      timestamp: 10,
      formation: '4-3-3',
      homeScoreBefore: 0,
      awayScoreBefore: 0,
    })
    expect(parsed.success).toBe(false)
  })

  test('LogGoalInputSchema accepts opponent goal', () => {
    const parsed = LogGoalInputSchema.safeParse({
      matchId: VALID_UUID,
      ourGoal: false,
      isPk: false,
      timestamp: 10,
      formation: '4-3-3',
      homeScoreBefore: 0,
      awayScoreBefore: 0,
      onFieldPlayerIds: [],
    })
    expect(parsed.success).toBe(true)
  })

  test('EndRegulationInputSchema rejects bad clockSeconds', () => {
    const parsed = EndRegulationInputSchema.safeParse({
      matchId: VALID_UUID,
      clockSeconds: 'soon',
      halfLengthMinutes: 30,
      formation: '4-3-3',
    })
    expect(parsed.success).toBe(false)
  })

  test('FinalizeReviewInputSchema requires matchId uuid', () => {
    const parsed = FinalizeReviewInputSchema.safeParse({ matchId: 'x' })
    expect(parsed.success).toBe(false)
    const ok = FinalizeReviewInputSchema.safeParse({ matchId: VALID_UUID })
    expect(ok.success).toBe(true)
  })

  test('LogCardInputSchema accepts yellow and rejects bad kind', () => {
    const ok = LogCardInputSchema.safeParse({
      matchId: VALID_UUID,
      playerId: VALID_UUID,
      kind: 'yellow',
      timestamp: 40,
      formation: '4-3-3',
      yellowCardCountBefore: 0,
      isOnField: true,
      playerLabel: '#7 Player',
    })
    expect(ok.success).toBe(true)
    const bad = LogCardInputSchema.safeParse({
      matchId: VALID_UUID,
      playerId: VALID_UUID,
      kind: 'blue',
      timestamp: 40,
      formation: '4-3-3',
      yellowCardCountBefore: 0,
      isOnField: true,
      playerLabel: '#7 Player',
    })
    expect(bad.success).toBe(false)
  })

  test('LogSubstitutionInputSchema accepts swap and rejects incomplete in', () => {
    const ok = LogSubstitutionInputSchema.safeParse({
      matchId: VALID_UUID,
      kind: 'swap',
      timestamp: 55,
      formation: '4-3-3',
      benchPlayerId: VALID_UUID,
      fieldPlayerId: '00000000-0000-4000-8000-000000000002',
      tacticalPosition: 'CM',
      benchSubbedInAt: 1200,
      fieldTotalSecondsPlayed: 400,
      benchPlayerLabel: '#10 On',
      fieldPlayerLabel: '#8 Off',
      currentPeriod: 1,
      totalPeriods: 2,
    })
    expect(ok.success).toBe(true)
    const bad = LogSubstitutionInputSchema.safeParse({
      matchId: VALID_UUID,
      kind: 'in',
      timestamp: 55,
      formation: '4-3-3',
      currentPeriod: 1,
      totalPeriods: 2,
    })
    expect(bad.success).toBe(false)
  })
})
