import { z } from 'zod'

export const MatchActionSideSchema = z.enum(['home', 'away'])
export const MatchTeamEventKindSchema = z.enum(['shot', 'save', 'corner'])

/** Shot / save / corner from the live match dashboard. */
export const LogTeamEventInputSchema = z.object({
  matchId: z.string().uuid(),
  side: MatchActionSideSchema,
  eventKind: MatchTeamEventKindSchema,
  timestamp: z.number().int().finite(),
  formation: z.string().catch(''),
  /** Required for home saves so we can attribute the GK; optional otherwise. */
  playerId: z.string().uuid().nullable().optional(),
  /** When true, also insert the paired auto-shot (save → opposing shot). Default true. */
  pairAutoShot: z.boolean().optional().default(true),
})

export type LogTeamEventInput = z.infer<typeof LogTeamEventInputSchema>

/** Our goal or opponent goal from the live match dashboard. */
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
    /** Current scores before this goal (client snapshot for push copy). */
    homeScoreBefore: z.number().int().nonnegative(),
    awayScoreBefore: z.number().int().nonnegative(),
    teamName: z.string().catch('Home'),
    opponent: z.string().catch('Opponent'),
    teamSlug: z.string().nullable().optional(),
    /** On-field attending player IDs for plus/minus bump. */
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

/**
 * End regulation / move match to pending_review (or prepare PK shootout).
 * Client still updates local clock/players; server persists DB side-effects.
 */
export const EndRegulationInputSchema = z.object({
  matchId: z.string().uuid(),
  clockSeconds: z.number().int().finite(),
  halfLengthMinutes: z.number().positive(),
  formation: z.string().catch(''),
  endedOnTime: z.boolean().nullable().optional(),
  enterPenaltyShootout: z.boolean().optional().default(false),
  /** Players still on the field at whistle — each gets a period_end sub_out. */
  onFieldPlayerIds: z.array(z.string().uuid()).default([]),
  /** Full finalized match_stats-shaped rows optional; server can update status alone if empty. */
  homeScore: z.number().int().nonnegative().optional(),
  awayScore: z.number().int().nonnegative().optional(),
  teamName: z.string().optional(),
  opponent: z.string().optional(),
  teamSlug: z.string().nullable().optional(),
  sendFullTimePush: z.boolean().optional().default(true),
})

export type EndRegulationInput = z.infer<typeof EndRegulationInputSchema>

/** Post-game finalize: persist plus/minus from events and set status to final. */
export const FinalizeReviewInputSchema = z.object({
  matchId: z.string().uuid(),
})

export type FinalizeReviewInput = z.infer<typeof FinalizeReviewInputSchema>

/** Yellow / red card from the live match dashboard. */
export const LogCardInputSchema = z.object({
  matchId: z.string().uuid(),
  playerId: z.string().uuid(),
  kind: z.enum(['yellow', 'red']),
  timestamp: z.number().int().finite(),
  formation: z.string().catch(''),
  /** Yellow count before this card (client snapshot) — used to detect 2nd yellow. */
  yellowCardCountBefore: z.number().int().nonnegative(),
  /** Whether the player was on the field when the card was issued. */
  isOnField: z.boolean(),
  /** Played seconds after local send-off clock finalize (optional). */
  totalSecondsPlayed: z.number().nonnegative().optional(),
  playerLabel: z.string().min(1),
  teamSlug: z.string().nullable().optional(),
})

export type LogCardInput = z.infer<typeof LogCardInputSchema>

export type MatchActionOk<T extends Record<string, unknown> = Record<string, never>> = {
  ok: true
} & T

export type MatchActionErr = {
  ok: false
  error: string
  code?: string
}

export type MatchActionResult<T extends Record<string, unknown> = Record<string, never>> =
  | MatchActionOk<T>
  | MatchActionErr

export function matchActionError(error: string, code?: string): MatchActionErr {
  return code ? { ok: false, error, code } : { ok: false, error }
}

/** Throw if a match API result failed — use inside optimistic `run` work. */
export function assertMatchActionOk<T extends Record<string, unknown>>(
  result: MatchActionResult<T>,
): asserts result is MatchActionOk<T> {
  if (!result.ok) {
    throw new Error(result.error || 'Match action failed')
  }
}
