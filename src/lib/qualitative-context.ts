export type ExecutionScore = 1 | 2 | 3 | 4 | 5

export type OpponentTier = 'tier1' | 'tier2' | 'tier3'

export type PracticeTransfer = 'yes' | 'partial' | 'not_really'

export type SidelineEnvironment = 'great' | 'chaotic'

export type QualitativeContext = {
  executionScore: ExecutionScore | null
  opponentTier: OpponentTier | null
  practiceTransfer: PracticeTransfer | null
  sidelineEnvironment: SidelineEnvironment | null
  focusChips: string[]
  /** Match finished within regulation (End Game confirmation). */
  endedOnTime: boolean | null
  /** Seconds past regulation when the period/match was last synced or finished. */
  addedTimeSeconds: number
}

export const EMPTY_QUALITATIVE_CONTEXT: QualitativeContext = {
  executionScore: null,
  opponentTier: null,
  practiceTransfer: null,
  sidelineEnvironment: null,
  focusChips: [],
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

export const PRACTICE_TRANSFER_OPTIONS: Array<{ id: PracticeTransfer; label: string }> = [
  { id: 'yes', label: 'Yes' },
  { id: 'partial', label: 'Partially' },
  { id: 'not_really', label: 'Not Really' },
]

export const SIDELINE_ENVIRONMENT_OPTIONS: Array<{ id: SidelineEnvironment; label: string }> = [
  { id: 'great', label: 'Great Environment / Fair Ref' },
  { id: 'chaotic', label: 'Chaotic Sideline / Difficult Ref' },
]

export const FOCUS_CHIP_OPTIONS = [
  'PassingFlow',
  'DefensiveShape',
  'SlowStart',
  'GreatFinishing',
  'LackedHustle',
  'Unlucky',
] as const

export type FocusChip = (typeof FOCUS_CHIP_OPTIONS)[number]

export function formatFocusChipLabel(chip: string): string {
  return `#${chip}`
}

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

function isPracticeTransfer(value: unknown): value is PracticeTransfer {
  return PRACTICE_TRANSFER_OPTIONS.some((option) => option.id === value)
}

function isSidelineEnvironment(value: unknown): value is SidelineEnvironment {
  return SIDELINE_ENVIRONMENT_OPTIONS.some((option) => option.id === value)
}

export function parseQualitativeContext(raw: unknown): QualitativeContext {
  if (!raw || typeof raw !== 'object') return { ...EMPTY_QUALITATIVE_CONTEXT }

  const record = raw as Record<string, unknown>
  const focusChips = Array.isArray(record.focusChips)
    ? record.focusChips.filter(
        (chip): chip is string => typeof chip === 'string' && FOCUS_CHIP_OPTIONS.includes(chip as FocusChip),
      )
    : []

  const addedTimeSeconds =
    typeof record.addedTimeSeconds === 'number' &&
    Number.isFinite(record.addedTimeSeconds) &&
    record.addedTimeSeconds > 0
      ? Math.floor(record.addedTimeSeconds)
      : 0

  return {
    executionScore: isExecutionScore(record.executionScore) ? record.executionScore : null,
    opponentTier: parseOpponentTier(record.opponentTier ?? record.oppositionStrength),
    practiceTransfer: isPracticeTransfer(record.practiceTransfer) ? record.practiceTransfer : null,
    sidelineEnvironment: isSidelineEnvironment(record.sidelineEnvironment)
      ? record.sidelineEnvironment
      : null,
    focusChips,
    endedOnTime: typeof record.endedOnTime === 'boolean' ? record.endedOnTime : null,
    addedTimeSeconds,
  }
}

/** Coaching fields only — timing metadata is separate for UI gating. */
export function hasQualitativeContext(context: QualitativeContext): boolean {
  return (
    context.executionScore !== null ||
    context.opponentTier !== null ||
    context.practiceTransfer !== null ||
    context.sidelineEnvironment !== null ||
    context.focusChips.length > 0
  )
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
    payload.practiceTransfer = context.practiceTransfer
    payload.sidelineEnvironment = context.sidelineEnvironment
    payload.focusChips = context.focusChips
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

function labelForPracticeTransfer(id: PracticeTransfer): string {
  return PRACTICE_TRANSFER_OPTIONS.find((option) => option.id === id)?.label ?? id
}

function labelForSideline(id: SidelineEnvironment): string {
  return SIDELINE_ENVIRONMENT_OPTIONS.find((option) => option.id === id)?.label ?? id
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
  if (context.practiceTransfer) {
    lines.push(`Training Focus: ${labelForPracticeTransfer(context.practiceTransfer)}`)
  }
  if (context.sidelineEnvironment) {
    lines.push(`Sideline: ${labelForSideline(context.sidelineEnvironment)}`)
  }
  if (context.focusChips.length > 0) {
    lines.push(`Focus: ${context.focusChips.map(formatFocusChipLabel).join(' ')}`)
  }

  return lines
}

function formatAddedTimeLabel(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds))
  const m = Math.floor(safe / 60)
  const s = safe % 60
  return `+${m}:${String(s).padStart(2, '0')}`
}
