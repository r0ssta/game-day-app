import { getMaxFieldPlayersForFormat, type TeamFormat } from '@/lib/team-format'

export type SubFrequency = 'high' | 'medium' | 'low'

export type SubRotationInput = {
  teamFormat: TeamFormat
  halfLengthMinutes: number
  attendingCount: number
  gkPlaysFullHalf: boolean
  /** Controls how often the whistle blows for a rotation. */
  frequency?: SubFrequency
  /**
   * Coach override for the interval (whole minutes). When set, replaces the
   * frequency-derived suggestion while players-to-swap is recomputed to match.
   */
  intervalOverrideMinutes?: number | null
}

export type SubRotationPlan = {
  formatSize: number
  fieldPositions: number
  availableFieldPlayers: number
  benchSize: number
  totalFieldMinutes: number
  /** Equal-play target minutes on the field this half. */
  targetMinutesPerPlayer: number
  /** Rest each outfield player needs this half (half − target). */
  totalRestNeeded: number
  frequency: SubFrequency
  /** Frequency-derived window count before any manual override. */
  targetWindows: number
  /** Suggested interval from frequency (before override). */
  suggestedIntervalMinutes: number
  /** Effective whole minutes used by the live countdown (suggestion or override). */
  subIntervalMinutes: number
  subIntervalSeconds: number
  /** Players to bring on / send off at each interval for equal play. */
  playersToSwap: number
  /** Coach-facing summary, e.g. "High Frequency: Rotate 3 players every 5 minutes". */
  recommendation: string | null
  ok: boolean
  message: string | null
}

export const SUB_FREQUENCY_OPTIONS: Array<{
  value: SubFrequency
  label: string
  hint: string
}> = [
  { value: 'high', label: 'High', hint: 'Short shifts, frequent fresh legs' },
  { value: 'medium', label: 'Medium', hint: 'Standard rotation' },
  { value: 'low', label: 'Low', hint: 'Longer shifts, fewer disruptions' },
]

export function frequencyDisplayLabel(frequency: SubFrequency): string {
  switch (frequency) {
    case 'high':
      return 'High Frequency'
    case 'medium':
      return 'Medium Frequency'
    case 'low':
      return 'Low Frequency'
  }
}

/**
 * Target sub windows per half from frequency.
 * Scaled to half length so a 25' half still lands near the coach-facing ranges
 * (Low ~12–15', Medium ~7–10', High ~4–5' on a 30' half).
 */
export function targetSubWindows(frequency: SubFrequency, halfLengthMinutes: number): number {
  const half = Math.max(1, Math.round(halfLengthMinutes))
  switch (frequency) {
    case 'low':
      return Math.max(1, Math.min(2, Math.round(half / 15)))
    case 'medium': {
      const mid = Math.round(half / 8)
      return Math.max(3, Math.min(4, mid || 3))
    }
    case 'high':
      return Math.max(5, Math.round(half / 5))
  }
}

export function playersToSwapForInterval(input: {
  benchSize: number
  intervalMinutes: number
  totalRestNeeded: number
}): number {
  const bench = Math.max(0, Math.floor(input.benchSize))
  if (bench <= 0) return 0
  const interval = Math.max(1, input.intervalMinutes)
  const rest = Math.max(0.1, input.totalRestNeeded)
  return Math.max(1, Math.min(bench, Math.round((bench * interval) / rest)))
}

function buildRecommendation(
  frequency: SubFrequency,
  playersToSwap: number,
  intervalMinutes: number,
): string {
  const playerLabel = playersToSwap === 1 ? 'player' : 'players'
  const minuteLabel = intervalMinutes === 1 ? 'minute' : 'minutes'
  return `${frequencyDisplayLabel(frequency)}: Rotate ${playersToSwap} ${playerLabel} every ${intervalMinutes} ${minuteLabel}`
}

function emptyPlan(
  partial: Pick<
    SubRotationPlan,
    | 'formatSize'
    | 'fieldPositions'
    | 'availableFieldPlayers'
    | 'benchSize'
    | 'totalFieldMinutes'
    | 'frequency'
    | 'targetWindows'
  > & {
    targetMinutesPerPlayer?: number
    totalRestNeeded?: number
    suggestedIntervalMinutes?: number
    subIntervalMinutes?: number
    message: string | null
    ok?: boolean
  },
): SubRotationPlan {
  const minutes = partial.subIntervalMinutes ?? 0
  return {
    formatSize: partial.formatSize,
    fieldPositions: partial.fieldPositions,
    availableFieldPlayers: partial.availableFieldPlayers,
    benchSize: partial.benchSize,
    totalFieldMinutes: partial.totalFieldMinutes,
    targetMinutesPerPlayer: partial.targetMinutesPerPlayer ?? 0,
    totalRestNeeded: partial.totalRestNeeded ?? 0,
    frequency: partial.frequency,
    targetWindows: partial.targetWindows,
    suggestedIntervalMinutes: partial.suggestedIntervalMinutes ?? 0,
    subIntervalMinutes: minutes,
    subIntervalSeconds: minutes * 60,
    playersToSwap: 0,
    recommendation: null,
    ok: partial.ok ?? false,
    message: partial.message,
  }
}

/**
 * Equal-play substitution plan with a High / Medium / Low frequency modifier.
 * Frequency sets how many sub windows to aim for; optional override nudges the
 * interval by whole minutes while rebalancing players-to-swap.
 */
export function calculateSubRotationPlan(input: SubRotationInput): SubRotationPlan {
  const formatSize = getMaxFieldPlayersForFormat(input.teamFormat)
  const halfLength = Math.max(1, Math.round(input.halfLengthMinutes))
  const attending = Math.max(0, Math.floor(input.attendingCount))
  const gkFull = Boolean(input.gkPlaysFullHalf)
  const frequency: SubFrequency = input.frequency ?? 'medium'
  const targetWindows = targetSubWindows(frequency, halfLength)

  const fieldPositions = Math.max(1, formatSize - (gkFull ? 1 : 0))
  const availableFieldPlayers = Math.max(0, attending - (gkFull ? 1 : 0))
  const benchSize = Math.max(0, availableFieldPlayers - fieldPositions)
  const totalFieldMinutes = fieldPositions * halfLength

  const base = {
    formatSize,
    fieldPositions,
    availableFieldPlayers,
    benchSize,
    totalFieldMinutes,
    frequency,
    targetWindows,
  }

  if (attending === 0) {
    return emptyPlan({
      ...base,
      message: 'Mark players attending to calculate a sub interval.',
    })
  }

  if (gkFull && attending < 2) {
    return emptyPlan({
      ...base,
      message: 'Need at least one outfield player besides the goalkeeper.',
    })
  }

  if (availableFieldPlayers < fieldPositions) {
    return emptyPlan({
      ...base,
      targetMinutesPerPlayer: halfLength,
      totalRestNeeded: 0,
      suggestedIntervalMinutes: halfLength,
      subIntervalMinutes: halfLength,
      ok: true,
      message: 'Fewer outfield players than field spots — everyone can play the full half.',
    })
  }

  const targetMinutesPerPlayer = totalFieldMinutes / availableFieldPlayers
  const totalRestNeeded = halfLength - targetMinutesPerPlayer
  const suggestedIntervalMinutes = Math.max(1, Math.round(halfLength / targetWindows))

  const hasOverride =
    input.intervalOverrideMinutes != null && Number.isFinite(input.intervalOverrideMinutes)
  const subIntervalMinutes = hasOverride
    ? Math.max(1, Math.min(halfLength, Math.round(input.intervalOverrideMinutes as number)))
    : suggestedIntervalMinutes

  const playersToSwap = playersToSwapForInterval({
    benchSize,
    intervalMinutes: subIntervalMinutes,
    totalRestNeeded,
  })

  return {
    formatSize,
    fieldPositions,
    availableFieldPlayers,
    benchSize,
    totalFieldMinutes,
    targetMinutesPerPlayer,
    totalRestNeeded,
    frequency,
    targetWindows,
    suggestedIntervalMinutes,
    subIntervalMinutes,
    subIntervalSeconds: subIntervalMinutes * 60,
    playersToSwap,
    recommendation: buildRecommendation(frequency, playersToSwap, subIntervalMinutes),
    ok: true,
    message: null,
  }
}

export function formatSubIntervalLabel(totalSeconds: number): string {
  const clamped = Math.max(0, Math.floor(totalSeconds))
  const mins = Math.floor(clamped / 60)
  const secs = clamped % 60
  return `${mins}:${String(secs).padStart(2, '0')}`
}
