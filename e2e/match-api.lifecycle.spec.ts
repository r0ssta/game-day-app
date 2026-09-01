import { expect, test } from '@playwright/test'
import { actionError, postMatchAction } from './match-request'
import {
  createE2eTestMatch,
  deleteE2eTestMatch,
  skipUnlessStaffE2e,
  staffAccessToken,
  staffE2eSkipReason,
  staffSupabase,
} from './staff-session'

const FORMATION = '4-3-3'

test.describe('match API lifecycle', () => {
  test.beforeAll(() => {
    const reason = staffE2eSkipReason()
    if (reason) skipUnlessStaffE2e(test, reason)
  })

  test('is_test match: start → shot/goal/sub/card → 2nd half undo → finalize', async ({
    request,
  }) => {
    const token = await staffAccessToken()
    const supabase = staffSupabase(token)
    const created = await createE2eTestMatch(supabase)
    if ('skip' in created) {
      skipUnlessStaffE2e(test, created.skip)
      return
    }

    const matchId = created.matchId
    const { starter, bench, teamName, teamSlug } = created

    try {
      const startFirst = await postMatchAction(request, token, '/api/match/log-period', {
        matchId,
        kind: 'start',
        period: 1,
        totalPeriods: 2,
        clockSeconds: 1800,
        halfLengthMinutes: 30,
        formation: FORMATION,
        teamName,
        opponent: 'E2E Opponent',
        teamSlug,
        periodCode: '1st',
        insertStarterEvents: true,
        starters: [
          {
            playerId: starter.id,
            label: starter.label,
            matchPosition: 'ST',
            subbedInAt: 1800,
          },
        ],
      })
      expect(startFirst.response.status(), actionError(startFirst.body)).toBe(200)
      expect(startFirst.body.ok).toBe(true)
      expect(startFirst.body.kind).toBe('start')

      const afterKickoff = await supabase
        .from('matches')
        .select('status, period_clock_started, current_period, is_test')
        .eq('id', matchId)
        .single()
      expect(afterKickoff.error).toBeNull()
      expect(afterKickoff.data?.is_test).toBe(true)
      expect(afterKickoff.data?.status).toBe('live')
      expect(afterKickoff.data?.period_clock_started).toBe(true)
      expect(afterKickoff.data?.current_period).toBe(1)

      const shot = await postMatchAction(request, token, '/api/match/log-team-event', {
        matchId,
        side: 'home',
        eventKind: 'shot',
        timestamp: 1700,
        formation: FORMATION,
        pairAutoShot: false,
      })
      expect(shot.response.status(), actionError(shot.body)).toBe(200)
      expect(shot.body.eventType).toBe('shot_home')

      const goal = await postMatchAction(request, token, '/api/match/log-goal', {
        matchId,
        ourGoal: true,
        isPk: false,
        scorerId: starter.id,
        scorerLabel: starter.label,
        timestamp: 1690,
        formation: FORMATION,
        homeScoreBefore: 0,
        awayScoreBefore: 0,
        teamName,
        opponent: 'E2E Opponent',
        teamSlug,
        onFieldPlayerIds: [starter.id],
        pairAutoShot: false,
      })
      expect(goal.response.status(), actionError(goal.body)).toBe(200)
      expect(goal.body.homeScore).toBe(1)
      expect(goal.body.eventType).toBe('goal')

      const sub = await postMatchAction(request, token, '/api/match/log-substitution', {
        matchId,
        kind: 'swap',
        timestamp: 1600,
        formation: FORMATION,
        benchPlayerId: bench.id,
        fieldPlayerId: starter.id,
        tacticalPosition: 'ST',
        benchSubbedInAt: 1600,
        fieldTotalSecondsPlayed: 200,
        benchPlayerLabel: bench.label,
        fieldPlayerLabel: starter.label,
        currentPeriod: 1,
        totalPeriods: 2,
        teamSlug,
      })
      expect(sub.response.status(), actionError(sub.body)).toBe(200)
      expect(sub.body.kind).toBe('swap')

      const card = await postMatchAction(request, token, '/api/match/log-card', {
        matchId,
        playerId: bench.id,
        kind: 'yellow',
        timestamp: 1550,
        formation: FORMATION,
        yellowCardCountBefore: 0,
        isOnField: true,
        playerLabel: bench.label,
        teamSlug,
      })
      expect(card.response.status(), actionError(card.body)).toBe(200)
      expect(card.body.issueRed).toBe(false)

      const formation = await postMatchAction(request, token, '/api/match/log-formation', {
        matchId,
        kind: 'reassign',
        timestamp: 1500,
        formation: FORMATION,
        positionUpdates: [{ playerId: bench.id, position: 'CAM' }],
      })
      expect(formation.response.status(), actionError(formation.body)).toBe(200)
      expect(formation.body.kind).toBe('reassign')

      const endFirst = await postMatchAction(request, token, '/api/match/log-period', {
        matchId,
        kind: 'end',
        period: 1,
        totalPeriods: 2,
        clockSeconds: 0,
        halfLengthMinutes: 30,
        formation: FORMATION,
        teamName,
        opponent: 'E2E Opponent',
        teamSlug,
        homeScore: 1,
        awayScore: 0,
        onFieldPlayers: [{ playerId: bench.id, totalSecondsPlayed: 500 }],
      })
      expect(endFirst.response.status(), actionError(endFirst.body)).toBe(200)
      expect(endFirst.body.kind).toBe('end')

      const startSecond = await postMatchAction(request, token, '/api/match/log-period', {
        matchId,
        kind: 'start',
        period: 2,
        totalPeriods: 2,
        clockSeconds: 1800,
        halfLengthMinutes: 30,
        formation: FORMATION,
        teamName,
        opponent: 'E2E Opponent',
        teamSlug,
        periodCode: '2nd',
        insertStarterEvents: true,
        starters: [
          {
            playerId: bench.id,
            label: bench.label,
            matchPosition: 'CAM',
            subbedInAt: 1800,
            totalSecondsPlayed: 500,
          },
        ],
      })
      expect(startSecond.response.status(), actionError(startSecond.body)).toBe(200)

      const conceded = await postMatchAction(request, token, '/api/match/log-goal', {
        matchId,
        ourGoal: false,
        isPk: false,
        timestamp: 1400,
        formation: FORMATION,
        homeScoreBefore: 1,
        awayScoreBefore: 0,
        teamName,
        opponent: 'E2E Opponent',
        teamSlug,
        onFieldPlayerIds: [bench.id],
        pairAutoShot: false,
      })
      expect(conceded.response.status(), actionError(conceded.body)).toBe(200)
      expect(conceded.body.awayScore).toBe(1)
      expect(conceded.body.eventType).toBe('opponent_goal')

      const undo = await postMatchAction(request, token, '/api/match/remove-last-goal', {
        matchId,
        side: 'away',
      })
      expect(undo.response.status(), actionError(undo.body)).toBe(200)
      expect(undo.body.awayScore).toBe(0)
      expect(undo.body.homeScore).toBe(1)

      const fullTime = await postMatchAction(request, token, '/api/match/end-regulation', {
        matchId,
        clockSeconds: 0,
        halfLengthMinutes: 30,
        formation: FORMATION,
        endedOnTime: true,
        enterPenaltyShootout: false,
        onFieldPlayerIds: [bench.id],
        homeScore: 1,
        awayScore: 0,
        teamName,
        opponent: 'E2E Opponent',
        teamSlug,
        sendFullTimePush: true,
      })
      expect(fullTime.response.status(), actionError(fullTime.body)).toBe(200)
      expect(fullTime.body.status).toBe('pending_review')

      const finalize = await postMatchAction(request, token, '/api/match/finalize-review', {
        matchId,
      })
      expect(finalize.response.status(), actionError(finalize.body)).toBe(200)
      expect(finalize.body.status).toBe('final')

      const finished = await supabase
        .from('matches')
        .select('status, home_score, away_score, period_clock_started, is_test')
        .eq('id', matchId)
        .single()
      expect(finished.error).toBeNull()
      expect(finished.data?.is_test).toBe(true)
      expect(finished.data?.status).toBe('final')
      expect(finished.data?.home_score).toBe(1)
      expect(finished.data?.away_score).toBe(0)
      expect(finished.data?.period_clock_started).toBe(false)
    } finally {
      await deleteE2eTestMatch(supabase, matchId)
    }
  })
})
