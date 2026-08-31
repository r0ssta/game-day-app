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

/**
 * Live substitution: bench in, field out, or swap (out then in).
 * Client applies local player state first; server persists events + match_stats + push.
 */
export const LogSubstitutionInputSchema = z
  .object({
    matchId: z.string().uuid(),
    kind: z.enum(['in', 'out', 'swap']),
    timestamp: z.number().int().finite(),
    formation: z.string().catch(''),
    /** Bench player coming on — required for `in` and `swap`. */
    benchPlayerId: z.string().uuid().optional(),
    /** Field player coming off — required for `out` and `swap`. */
    fieldPlayerId: z.string().uuid().optional(),
    /** Tactical slot label stored on sub_in event_notes / match_position. */
    tacticalPosition: z.string().optional(),
    /** Remaining countdown when the bench player entered (subbed_in_at). */
    benchSubbedInAt: z.number().finite().nullable().optional(),
    /** Accumulated play seconds after finalizing the outgoing stint. */
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

/**
 * Start or end a regulation period (not full-time — use EndRegulation for that).
 * `start` covers kickoff (period 1 → match_start push) and post-intermission starts.
 * `end` covers intermediate whistle → intermission (period_end push + period_end sub_outs).
 */
export const LogPeriodInputSchema = z
  .object({
    matchId: z.string().uuid(),
    kind: z.enum(['start', 'end']),
    /** Period being started, or period that just ended. */
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
    /** Optional DB period code (`1st` / `2nd`) when starting the next period. */
    periodCode: z.enum(['1st', '2nd', '3rd']).optional(),
    /** Insert starting-lineup sub_in rows (next-period starts). */
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

/**
 * One penalty-shootout attempt from the live PK screen.
 * Client updates local rounds/scores first; server persists the event + match PK scores.
 */
export const LogPkAttemptInputSchema = z
  .object({
    matchId: z.string().uuid(),
    /** Shootout round (also stored as match_events.timestamp). */
    round: z.number().int().positive(),
    team: z.enum(['us', 'opponent']),
    result: z.enum(['make', 'miss']),
    /** Required when team is `us` (our taker); omitted for opponent attempts. */
    playerId: z.string().uuid().nullable().optional(),
    formation: z.string().catch(''),
    /** PK scores before this attempt (client snapshot). */
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

/**
 * Finalize a penalty shootout: persist PK scores + winner, move to pending_review,
 * and send the full-time parent push (skipped for testing matches).
 */
export const FinalizePkInputSchema = z
  .object({
    matchId: z.string().uuid(),
    homePkScore: z.number().int().nonnegative(),
    awayPkScore: z.number().int().nonnegative(),
    pkWinnerIsUs: z.boolean(),
    /** Regulation scores for full-time push copy. */
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

/**
 * Live formation switch or on-pitch position remap.
 * Client updates local pitch/players first; server persists events + match_stats.
 */
export const LogFormationInputSchema = z
  .object({
    matchId: z.string().uuid(),
    kind: z.enum(['switch', 'reassign']),
    timestamp: z.number().int().finite(),
    /** Formation id stored on the events (the formation in effect after the change). */
    formation: z.string().min(1),
    /** Human labels for formation_change notes — required for `switch`. */
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
    /** Players who no longer fit after a smaller formation — each gets a sub_out. */
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
