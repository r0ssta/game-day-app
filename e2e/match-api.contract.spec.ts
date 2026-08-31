import { expect, test } from '@playwright/test'
import {
  EndRegulationInputSchema,
  FinalizePkInputSchema,
  FinalizeReviewInputSchema,
  LogCardInputSchema,
  LogFormationInputSchema,
  LogGoalInputSchema,
  LogPeriodInputSchema,
  LogPkAttemptInputSchema,
  LogSubstitutionInputSchema,
  LogTeamEventInputSchema,
  RemoveLastGoalInputSchema,
} from '../src/schemas/match-actions'

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

  test('LogPeriodInputSchema accepts start and requires scores for end', () => {
    const start = LogPeriodInputSchema.safeParse({
      matchId: VALID_UUID,
      kind: 'start',
      period: 1,
      totalPeriods: 2,
      clockSeconds: 1800,
      halfLengthMinutes: 30,
      formation: '4-3-3',
      teamName: 'Velocity',
      opponent: 'Rivals',
      starters: [{ playerId: VALID_UUID, label: '#1 GK' }],
    })
    expect(start.success).toBe(true)
    const endBad = LogPeriodInputSchema.safeParse({
      matchId: VALID_UUID,
      kind: 'end',
      period: 1,
      totalPeriods: 2,
      clockSeconds: 0,
      halfLengthMinutes: 30,
      formation: '4-3-3',
      teamName: 'Velocity',
    })
    expect(endBad.success).toBe(false)
  })

  test('LogPkAttemptInputSchema requires playerId for us and accepts opponent miss', () => {
    const usBad = LogPkAttemptInputSchema.safeParse({
      matchId: VALID_UUID,
      round: 1,
      team: 'us',
      result: 'make',
      formation: '4-3-3',
      homePkScoreBefore: 0,
      awayPkScoreBefore: 0,
    })
    expect(usBad.success).toBe(false)
    const usOk = LogPkAttemptInputSchema.safeParse({
      matchId: VALID_UUID,
      round: 1,
      team: 'us',
      result: 'make',
      playerId: VALID_UUID,
      formation: '4-3-3',
      homePkScoreBefore: 0,
      awayPkScoreBefore: 0,
    })
    expect(usOk.success).toBe(true)
    const opponent = LogPkAttemptInputSchema.safeParse({
      matchId: VALID_UUID,
      round: 2,
      team: 'opponent',
      result: 'miss',
      formation: '4-3-3',
      homePkScoreBefore: 1,
      awayPkScoreBefore: 0,
    })
    expect(opponent.success).toBe(true)
  })

  test('FinalizePkInputSchema rejects a tied shootout and accepts a winner', () => {
    const tied = FinalizePkInputSchema.safeParse({
      matchId: VALID_UUID,
      homePkScore: 3,
      awayPkScore: 3,
      pkWinnerIsUs: true,
      homeScore: 1,
      awayScore: 1,
      teamName: 'Velocity',
    })
    expect(tied.success).toBe(false)
    const mismatch = FinalizePkInputSchema.safeParse({
      matchId: VALID_UUID,
      homePkScore: 4,
      awayPkScore: 5,
      pkWinnerIsUs: true,
      homeScore: 1,
      awayScore: 1,
      teamName: 'Velocity',
    })
    expect(mismatch.success).toBe(false)
    const ok = FinalizePkInputSchema.safeParse({
      matchId: VALID_UUID,
      homePkScore: 4,
      awayPkScore: 3,
      pkWinnerIsUs: true,
      homeScore: 1,
      awayScore: 1,
      teamName: 'Velocity',
      opponent: 'Rivals',
    })
    expect(ok.success).toBe(true)
  })

  test('LogFormationInputSchema requires labels for switch and updates for reassign', () => {
    const switchBad = LogFormationInputSchema.safeParse({
      matchId: VALID_UUID,
      kind: 'switch',
      timestamp: 40,
      formation: '4-3-3',
    })
    expect(switchBad.success).toBe(false)
    const switchOk = LogFormationInputSchema.safeParse({
      matchId: VALID_UUID,
      kind: 'switch',
      timestamp: 40,
      formation: '4-3-3',
      previousLabel: '4-4-2',
      nextLabel: '4-3-3',
      positionUpdates: [{ playerId: VALID_UUID, position: 'CM' }],
    })
    expect(switchOk.success).toBe(true)
    const reassignBad = LogFormationInputSchema.safeParse({
      matchId: VALID_UUID,
      kind: 'reassign',
      timestamp: 40,
      formation: '4-3-3',
    })
    expect(reassignBad.success).toBe(false)
    const reassignOk = LogFormationInputSchema.safeParse({
      matchId: VALID_UUID,
      kind: 'reassign',
      timestamp: 40,
      formation: '4-3-3',
      positionUpdates: [{ playerId: VALID_UUID, position: 'ST' }],
    })
    expect(reassignOk.success).toBe(true)
  })

  test('RemoveLastGoalInputSchema accepts home/away and rejects a bad side', () => {
    const home = RemoveLastGoalInputSchema.safeParse({
      matchId: VALID_UUID,
      side: 'home',
    })
    expect(home.success).toBe(true)
    const away = RemoveLastGoalInputSchema.safeParse({
      matchId: VALID_UUID,
      side: 'away',
    })
    expect(away.success).toBe(true)
    const bad = RemoveLastGoalInputSchema.safeParse({
      matchId: VALID_UUID,
      side: 'left',
    })
    expect(bad.success).toBe(false)
  })
})
