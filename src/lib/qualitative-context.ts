export type ExecutionScore = 1 | 2 | 3 | 4 | 5

export type OpponentTier = 'tier1' | 'tier2' | 'tier3'

export type QualitativeContext = {
  executionScore: ExecutionScore | null
  opponentTier: OpponentTier | null
  /** Match finished within regulation (End Game confirmation). */
  endedOnTime: boolean | null
  /** Seconds past regulation when the period/match was last synced or finished. */
  addedTimeSeconds: number
}

export const EMPTY_QUALITATIVE_CONTEXT: QualitativeContext = {
  executionScore: null,
  opponentTier: null,
  endedOnTime: null,
  addedTimeSeconds: 0,
}

export const EXECUTION_SCORE_OPTIONS: Array<{
  score: ExecutionScore
  label: string
  description: string
}> = [
  {
    score: 5,
    label: 'Elite Execution',
    description: 'Flawless tactical discipline and control',
  },
  {
    score: 4,
    label: 'Strong Performance',
    description: 'Controlled match rhythm, minor lapses',
  },
  {
    score: 3,
    label: 'Balanced / Even',
    description: 'Solid effort, even match',
  },
  {
    score: 2,
    label: 'Sub-Standard',
    description: 'Struggled with shape and execution',
  },
  {
    score: 1,
    label: 'Poor Execution',
    description: 'Major breakdown in standards',
  },
]

export const OPPONENT_TIER_OPTIONS: Array<{
  id: OpponentTier
  tierLabel: string
  title: string
  subtitle: string
}> = [
  {
    id: 'tier1',
    tierLabel: 'Tier 1',
    title: 'We Were Favored',
    subtitle: 'Lower opponent',
  },
  {
    id: 'tier2',
    tierLabel: 'Tier 2',
    title: 'Even Matchup',
    subtitle: 'Peer team',
  },
  {
    id: 'tier3',
    tierLabel: 'Tier 3',
    title: 'Elite Opponent',
    subtitle: 'Superior team',
  },
]

function isExecutionScore(value: unknown): value is ExecutionScore {
  return typeof value === 'number' && value >= 1 && value <= 5 && Number.isInteger(value)
}

function isOpponentTier(value: unknown): value is OpponentTier {
  return OPPONENT_TIER_OPTIONS.some((option) => option.id === value)
}

function parseOpponentTier(raw: unknown): OpponentTier | null {
  if (isOpponentTier(raw)) return raw
  if (raw === 'easy') return 'tier1'
  if (raw === 'competitive') return 'tier2'
  if (raw === 'superior') return 'tier3'
  return null
}

export function parseQualitativeContext(raw: unknown): QualitativeContext {
  if (!raw || typeof raw !== 'object') return { ...EMPTY_QUALITATIVE_CONTEXT }

  const record = raw as Record<string, unknown>

  const addedTimeSeconds =
    typeof record.addedTimeSeconds === 'number' &&
    Number.isFinite(record.addedTimeSeconds) &&
    record.addedTimeSeconds > 0
      ? Math.floor(record.addedTimeSeconds)
      : 0

  return {
    executionScore: isExecutionScore(record.executionScore) ? record.executionScore : null,
    opponentTier: parseOpponentTier(record.opponentTier ?? record.oppositionStrength),
    endedOnTime: typeof record.endedOnTime === 'boolean' ? record.endedOnTime : null,
    addedTimeSeconds,
  }
}

/** Coaching fields only — timing metadata is separate for UI gating. */
export function hasQualitativeContext(context: QualitativeContext): boolean {
  return context.executionScore !== null || context.opponentTier !== null
}

export function hasMatchTimingContext(context: QualitativeContext): boolean {
  return context.endedOnTime !== null || context.addedTimeSeconds > 0
}

/** Serialize coaching + timing fields for DB persistence without dropping OT metadata. */
export function serializeQualitativeContext(
  context: QualitativeContext,
): Record<string, unknown> | null {
  const hasCoaching = hasQualitativeContext(context)
  const hasTiming = hasMatchTimingContext(context)
  if (!hasCoaching && !hasTiming) return null

  const payload: Record<string, unknown> = {}
  if (hasCoaching) {
    payload.executionScore = context.executionScore
    payload.opponentTier = context.opponentTier
  }
  if (context.endedOnTime !== null) payload.endedOnTime = context.endedOnTime
  if (context.addedTimeSeconds > 0) payload.addedTimeSeconds = context.addedTimeSeconds
  return payload
}

export function formatExecutionScoreSummary(score: ExecutionScore): string {
  const option = EXECUTION_SCORE_OPTIONS.find((entry) => entry.score === score)
  if (!option) return String(score)
  return `${score} - ${option.label} (${option.description})`
}

function formatOpponentTierSummary(id: OpponentTier): string {
  const option = OPPONENT_TIER_OPTIONS.find((entry) => entry.id === id)
  if (!option) return id
  return `${option.tierLabel}: ${option.title} / ${option.subtitle}`
}

export function formatQualitativeContextSummary(context: QualitativeContext): string[] {
  if (!hasQualitativeContext(context) && !hasMatchTimingContext(context)) return []

  const lines: string[] = ['QUALITATIVE CONTEXT', '--------------------']

  if (context.endedOnTime !== null) {
    lines.push(
      context.endedOnTime
        ? 'Full Time: Ended on time'
        : `Full Time: Added time ${formatAddedTimeLabel(context.addedTimeSeconds)}`,
    )
  } else if (context.addedTimeSeconds > 0) {
    lines.push(`Added time recorded: ${formatAddedTimeLabel(context.addedTimeSeconds)}`)
  }

  if (context.executionScore !== null) {
    lines.push(`Team Execution Score: ${formatExecutionScoreSummary(context.executionScore)}`)
  }
  if (context.opponentTier) {
    lines.push(`Opponent Tier & Match Shape: ${formatOpponentTierSummary(context.opponentTier)}`)
  }

  return lines
}

function formatAddedTimeLabel(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds))
  const m = Math.floor(safe / 60)
  const s = safe % 60
  return `+${m}:${String(s).padStart(2, '0')}`
}
