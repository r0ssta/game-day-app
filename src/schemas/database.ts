import { z } from 'zod'
import type {
  DbMatch,
  DbMatchReview,
  DbPlayer,
  DbTeam,
} from '@/types/database'

const isoTimestamp = z.union([z.string(), z.number()]).transform((value) => String(value))

/** Core team row from `public.teams`. */
export const TeamSchema: z.ZodType<DbTeam> = z
  .object({
    id: z.string().min(1),
    name: z.string(),
    slug: z.string().catch(''),
    brand_color: z.string().catch('#12141c'),
    logo_url: z.string().nullable().catch(null),
    format: z.string().catch('11v11'),
    age_group: z.string().nullable().optional().catch(null),
    primary_coach_name: z.string().optional().catch(undefined),
    active_status: z.boolean().catch(true),
    created_at: isoTimestamp.catch(''),
  })
  .passthrough() as z.ZodType<DbTeam>

/** Core player row from `public.players`. */
export const PlayerSchema: z.ZodType<DbPlayer> = z
  .object({
    id: z.string().min(1),
    first_name: z.string().catch(''),
    last_name: z.string().catch(''),
    jersey: z.number().nullable().catch(null),
    age_group: z.string().catch(''),
    active_status: z.boolean().catch(true),
    is_guest: z.boolean().catch(false),
    position: z.string().catch(''),
    primary_position: z.string().nullable().catch(null),
    secondary_position: z.string().nullable().catch(null),
    created_at: isoTimestamp.catch(''),
    name: z.string().optional(),
  })
  .passthrough() as z.ZodType<DbPlayer>

const MatchStatusSchema = z.enum(['scheduled', 'live', 'pending_review', 'final'])
const MatchPeriodSchema = z.enum(['1st', '2nd', '3rd'])

/** Core match row from `public.matches`. */
export const MatchSchema: z.ZodType<DbMatch> = z
  .object({
    id: z.string().min(1),
    team_id: z.string().min(1),
    season_id: z.string().min(1).catch(''),
    coach_id: z.string().nullable().catch(null),
    coach_name: z.string().nullable().catch(null),
    opponent: z.string().catch('Opponent'),
    date: isoTimestamp.catch(''),
    match_date: z.string().nullable().catch(null),
    match_time: z.string().nullable().catch(null),
    half_length: z.number().catch(25),
    period_length: z.number().optional(),
    total_periods: z.number().optional(),
    current_period: z.number().optional(),
    location: z.string().catch(''),
    location_type: z.string().nullable().optional().catch(null),
    tournament_game: z.boolean().catch(false),
    is_test: z.boolean().catch(false),
    goes_to_pks: z.boolean().catch(false),
    home_score: z.number().catch(0),
    away_score: z.number().catch(0),
    home_pk_score: z.number().catch(0),
    away_pk_score: z.number().catch(0),
    pk_winner_is_us: z.boolean().nullable().catch(null),
    pk_gk_player_id: z.string().nullable().optional().catch(null),
    clock_seconds: z.number().catch(0),
    period: MatchPeriodSchema.catch('1st'),
    status: MatchStatusSchema.catch('scheduled'),
    period_clock_started: z.boolean().catch(false),
    internal_coach_notes: z.string().nullable().catch(null),
    parent_facing_recap: z.string().nullable().catch(null),
    sub_interval_seconds: z.number().nullable().catch(null),
    gk_plays_full_half: z.boolean().catch(false),
    stat_tracker_token: z.string().nullable().optional().catch(null),
    qualitative_context: z.unknown().nullable().optional().catch(null),
    created_at: isoTimestamp.catch(''),
  })
  .passthrough() as z.ZodType<DbMatch>

/**
 * Post-match player evaluation (`match_reviews`) — 1–5 rating scale.
 * Alias: EvaluationSchema per product request.
 */
export const EvaluationSchema: z.ZodType<DbMatchReview> = z
  .object({
    id: z.string().min(1),
    match_id: z.string().min(1),
    player_id: z.string().min(1),
    position: z.string().catch(''),
    rating: z.number().min(1).max(5).catch(3),
    review_notes: z.string().nullable().catch(null),
    created_at: isoTimestamp.catch(''),
    updated_at: isoTimestamp.catch(''),
  })
  .passthrough() as z.ZodType<DbMatchReview>

/** @deprecated Prefer EvaluationSchema — kept as a clear MatchReview alias. */
export const MatchReviewSchema = EvaluationSchema

export type Team = z.infer<typeof TeamSchema>
export type Player = z.infer<typeof PlayerSchema>
export type Match = z.infer<typeof MatchSchema>
export type Evaluation = z.infer<typeof EvaluationSchema>

const ParentHubPlayerSchema = z.object({
  id: z.string().min(1),
  firstName: z.string().catch(''),
  lastName: z.string().catch(''),
  number: z.number().nullable().catch(null),
})

const ParentHubMatchSchema = z
  .object({
    id: z.string().min(1),
    opponent: z.string().catch('Opponent'),
    status: MatchStatusSchema.catch('scheduled'),
    match_date: z.string().nullable().catch(null),
    match_time: z.string().nullable().catch(null),
    date: isoTimestamp.catch(''),
    location_type: z.string().nullable().catch(null),
    home_score: z.number().catch(0),
    away_score: z.number().catch(0),
    home_pk_score: z.number().catch(0),
    away_pk_score: z.number().catch(0),
    pk_winner_is_us: z.boolean().nullable().catch(null),
    period: z.string().catch('1st'),
    current_period: z.number().nullable().catch(null),
    total_periods: z.number().nullable().catch(null),
    period_length: z.number().nullable().catch(null),
    half_length: z.number().catch(25),
    period_clock_started: z.boolean().catch(false),
    clock_seconds: z.number().catch(0),
    parent_facing_recap: z.string().nullable().catch(null),
    starters: z.array(ParentHubPlayerSchema).optional().catch([]),
    isTest: z.boolean().catch(false),
  })
  .passthrough()

/** Public Parent Hub RPC payload (`get_parent_hub` / `get_parent_hub_by_slug`). */
export const ParentHubPayloadSchema = z.object({
  teamId: z.string().min(1),
  teamSlug: z.string().catch(''),
  teamName: z.string().catch('Team'),
  ageGroup: z.string().nullable().catch(null),
  brandColor: z.string().nullable().catch(null),
  logoUrl: z.string().nullable().catch(null),
  players: z.array(ParentHubPlayerSchema).catch([]),
  matches: z.array(ParentHubMatchSchema).catch([]),
  staffPreview: z.boolean().catch(false),
})
