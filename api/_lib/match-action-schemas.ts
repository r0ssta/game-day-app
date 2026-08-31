/**
 * Zod schemas for match orchestration APIs — kept under api/_lib so Vercel
 * Node handlers do not depend on Vite path aliases.
 */
import { z } from 'zod'

export const MatchActionSideSchema = z.enum(['home', 'away'])
export const MatchTeamEventKindSchema = z.enum(['shot', 'save', 'corner'])

export const LogTeamEventInputSchema = z.object({
  matchId: z.string().uuid(),
  side: MatchActionSideSchema,
  eventKind: MatchTeamEventKindSchema,
  timestamp: z.number().int().finite(),
  formation: z.string().catch(''),
  playerId: z.string().uuid().nullable().optional(),
  pairAutoShot: z.boolean().optional().default(true),
})

export type LogTeamEventInput = z.infer<typeof LogTeamEventInputSchema>

export const LogGoalInputSchema = z
  .object({
    matchId: z.string().uuid(),
    ourGoal: z.boolean(),
    isPk: z.boolean().default(false),
    scorerId: z.string().uuid().nullable().optional(),
    assistPlayerId: z.string().uuid().nullable().optional(),
    scorerLabel: z.string().optional(),
    assistLabel: z.string().nullable().optional(),
    timestamp: z.number().int().finite(),
    formation: z.string().catch(''),
    homeScoreBefore: z.number().int().nonnegative(),
    awayScoreBefore: z.number().int().nonnegative(),
    teamName: z.string().catch('Home'),
    opponent: z.string().catch('Opponent'),
    teamSlug: z.string().nullable().optional(),
    onFieldPlayerIds: z.array(z.string().uuid()).default([]),
    pairAutoShot: z.boolean().optional().default(true),
  })
  .superRefine((value, ctx) => {
    if (value.ourGoal && !value.scorerId) {
      ctx.addIssue({
        code: 'custom',
        message: 'scorerId is required for our goals',
        path: ['scorerId'],
      })
    }
    if (
      value.ourGoal &&
      value.assistPlayerId &&
      value.scorerId &&
      value.assistPlayerId === value.scorerId
    ) {
      ctx.addIssue({
        code: 'custom',
        message: 'assistPlayerId cannot equal scorerId',
        path: ['assistPlayerId'],
      })
    }
  })

export type LogGoalInput = z.infer<typeof LogGoalInputSchema>

export const EndRegulationInputSchema = z.object({
  matchId: z.string().uuid(),
  clockSeconds: z.number().int().finite(),
  halfLengthMinutes: z.number().positive(),
  formation: z.string().catch(''),
  endedOnTime: z.boolean().nullable().optional(),
  enterPenaltyShootout: z.boolean().optional().default(false),
  onFieldPlayerIds: z.array(z.string().uuid()).default([]),
  homeScore: z.number().int().nonnegative().optional(),
  awayScore: z.number().int().nonnegative().optional(),
  teamName: z.string().optional(),
  opponent: z.string().optional(),
  teamSlug: z.string().nullable().optional(),
  sendFullTimePush: z.boolean().optional().default(true),
})

export type EndRegulationInput = z.infer<typeof EndRegulationInputSchema>

export const FinalizeReviewInputSchema = z.object({
  matchId: z.string().uuid(),
})

export type FinalizeReviewInput = z.infer<typeof FinalizeReviewInputSchema>

export const LogCardInputSchema = z.object({
  matchId: z.string().uuid(),
  playerId: z.string().uuid(),
  kind: z.enum(['yellow', 'red']),
  timestamp: z.number().int().finite(),
  formation: z.string().catch(''),
  yellowCardCountBefore: z.number().int().nonnegative(),
  isOnField: z.boolean(),
  totalSecondsPlayed: z.number().nonnegative().optional(),
  playerLabel: z.string().min(1),
  teamSlug: z.string().nullable().optional(),
})

export type LogCardInput = z.infer<typeof LogCardInputSchema>

export const LogSubstitutionInputSchema = z
  .object({
    matchId: z.string().uuid(),
    kind: z.enum(['in', 'out', 'swap']),
    timestamp: z.number().int().finite(),
    formation: z.string().catch(''),
    benchPlayerId: z.string().uuid().optional(),
    fieldPlayerId: z.string().uuid().optional(),
    tacticalPosition: z.string().optional(),
    benchSubbedInAt: z.number().finite().nullable().optional(),
    fieldTotalSecondsPlayed: z.number().nonnegative().optional(),
    benchPlayerLabel: z.string().optional(),
    fieldPlayerLabel: z.string().optional(),
    currentPeriod: z.number().int().positive(),
    totalPeriods: z.union([z.literal(2), z.literal(3)]),
    teamSlug: z.string().nullable().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.kind === 'in' || value.kind === 'swap') {
      if (!value.benchPlayerId) {
        ctx.addIssue({
          code: 'custom',
          message: 'benchPlayerId is required for in/swap',
          path: ['benchPlayerId'],
        })
      }
      if (value.benchSubbedInAt === undefined) {
        ctx.addIssue({
          code: 'custom',
          message: 'benchSubbedInAt is required for in/swap',
          path: ['benchSubbedInAt'],
        })
      }
      if (!value.benchPlayerLabel?.trim()) {
        ctx.addIssue({
          code: 'custom',
          message: 'benchPlayerLabel is required for in/swap',
          path: ['benchPlayerLabel'],
        })
      }
    }
    if (value.kind === 'out' || value.kind === 'swap') {
      if (!value.fieldPlayerId) {
        ctx.addIssue({
          code: 'custom',
          message: 'fieldPlayerId is required for out/swap',
          path: ['fieldPlayerId'],
        })
      }
      if (typeof value.fieldTotalSecondsPlayed !== 'number') {
        ctx.addIssue({
          code: 'custom',
          message: 'fieldTotalSecondsPlayed is required for out/swap',
          path: ['fieldTotalSecondsPlayed'],
        })
      }
      if (!value.fieldPlayerLabel?.trim()) {
        ctx.addIssue({
          code: 'custom',
          message: 'fieldPlayerLabel is required for out/swap',
          path: ['fieldPlayerLabel'],
        })
      }
    }
    if (
      value.kind === 'swap' &&
      value.benchPlayerId &&
      value.fieldPlayerId &&
      value.benchPlayerId === value.fieldPlayerId
    ) {
      ctx.addIssue({
        code: 'custom',
        message: 'benchPlayerId cannot equal fieldPlayerId',
        path: ['benchPlayerId'],
      })
    }
  })

export type LogSubstitutionInput = z.infer<typeof LogSubstitutionInputSchema>

export const LogPeriodInputSchema = z
  .object({
    matchId: z.string().uuid(),
    kind: z.enum(['start', 'end']),
    period: z.number().int().positive(),
    totalPeriods: z.union([z.literal(2), z.literal(3)]),
    clockSeconds: z.number().int().finite(),
    halfLengthMinutes: z.number().positive(),
    formation: z.string().catch(''),
    teamName: z.string().min(1),
    opponent: z.string().catch('Opponent'),
    teamSlug: z.string().nullable().optional(),
    homeScore: z.number().int().nonnegative().optional(),
    awayScore: z.number().int().nonnegative().optional(),
    periodCode: z.enum(['1st', '2nd', '3rd']).optional(),
    insertStarterEvents: z.boolean().optional().default(false),
    starters: z
      .array(
        z.object({
          playerId: z.string().uuid(),
          label: z.string().min(1),
          matchPosition: z.string().nullable().optional(),
          subbedInAt: z.number().finite().nullable().optional(),
          totalSecondsPlayed: z.number().nonnegative().optional(),
        }),
      )
      .default([]),
    onFieldPlayers: z
      .array(
        z.object({
          playerId: z.string().uuid(),
          totalSecondsPlayed: z.number().nonnegative(),
        }),
      )
      .default([]),
  })
  .superRefine((value, ctx) => {
    if (value.kind === 'end') {
      if (typeof value.homeScore !== 'number' || typeof value.awayScore !== 'number') {
        ctx.addIssue({
          code: 'custom',
          message: 'homeScore and awayScore are required when ending a period',
          path: ['homeScore'],
        })
      }
    }
  })

export type LogPeriodInput = z.infer<typeof LogPeriodInputSchema>

export const LogPkAttemptInputSchema = z
  .object({
    matchId: z.string().uuid(),
    round: z.number().int().positive(),
    team: z.enum(['us', 'opponent']),
    result: z.enum(['make', 'miss']),
    playerId: z.string().uuid().nullable().optional(),
    formation: z.string().catch(''),
    homePkScoreBefore: z.number().int().nonnegative(),
    awayPkScoreBefore: z.number().int().nonnegative(),
  })
  .superRefine((value, ctx) => {
    if (value.team === 'us' && !value.playerId) {
      ctx.addIssue({
        code: 'custom',
        message: 'playerId is required for our PK attempts',
        path: ['playerId'],
      })
    }
  })

export type LogPkAttemptInput = z.infer<typeof LogPkAttemptInputSchema>

export const FinalizePkInputSchema = z
  .object({
    matchId: z.string().uuid(),
    homePkScore: z.number().int().nonnegative(),
    awayPkScore: z.number().int().nonnegative(),
    pkWinnerIsUs: z.boolean(),
    homeScore: z.number().int().nonnegative(),
    awayScore: z.number().int().nonnegative(),
    teamName: z.string().min(1),
    opponent: z.string().catch('Opponent'),
    teamSlug: z.string().nullable().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.homePkScore === value.awayPkScore) {
      ctx.addIssue({
        code: 'custom',
        message: 'PK scores cannot be tied when finalizing',
        path: ['homePkScore'],
      })
    }
    if (value.pkWinnerIsUs !== value.homePkScore > value.awayPkScore) {
      ctx.addIssue({
        code: 'custom',
        message: 'pkWinnerIsUs must match the PK score line',
        path: ['pkWinnerIsUs'],
      })
    }
  })

export type FinalizePkInput = z.infer<typeof FinalizePkInputSchema>

export const LogFormationInputSchema = z
  .object({
    matchId: z.string().uuid(),
    kind: z.enum(['switch', 'reassign']),
    timestamp: z.number().int().finite(),
    formation: z.string().min(1),
    previousLabel: z.string().optional(),
    nextLabel: z.string().optional(),
    positionUpdates: z
      .array(
        z.object({
          playerId: z.string().uuid(),
          position: z.string().min(1),
        }),
      )
      .default([]),
    overflowPlayers: z
      .array(
        z.object({
          playerId: z.string().uuid(),
          totalSecondsPlayed: z.number().nonnegative(),
        }),
      )
      .default([]),
  })
  .superRefine((value, ctx) => {
    if (value.kind === 'switch') {
      if (!value.previousLabel?.trim() || !value.nextLabel?.trim()) {
        ctx.addIssue({
          code: 'custom',
          message: 'previousLabel and nextLabel are required when switching formation',
          path: ['previousLabel'],
        })
      }
    }
    if (value.kind === 'reassign' && value.positionUpdates.length === 0) {
      ctx.addIssue({
        code: 'custom',
        message: 'positionUpdates is required when reassigning',
        path: ['positionUpdates'],
      })
    }
  })

export type LogFormationInput = z.infer<typeof LogFormationInputSchema>

export const RemoveLastGoalInputSchema = z.object({
  matchId: z.string().uuid(),
  side: MatchActionSideSchema,
})

export type RemoveLastGoalInput = z.infer<typeof RemoveLastGoalInputSchema>
