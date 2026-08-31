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
