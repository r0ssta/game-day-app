import { getMaxFieldPlayersForFormat, type TeamFormat } from '@/lib/team-format'

export type SubRotationInput = {
  teamFormat: TeamFormat
  halfLengthMinutes: number
  attendingCount: number
  gkPlaysFullHalf: boolean
}

export type SubRotationPlan = {
  formatSize: number
  fieldPositions: number
  availableFieldPlayers: number
  totalFieldMinutes: number
  targetMinutesPerPlayer: number
  /** Whole minutes for coach display / countdown reset. */
  subIntervalMinutes: number
  subIntervalSeconds: number
  ok: boolean
  message: string | null
}

/**
 * Equal-play substitution interval for youth formats.
 * GK can be held out of the rotation when they play the full half.
 */
export function calculateSubRotationPlan(input: SubRotationInput): SubRotationPlan {
  const formatSize = getMaxFieldPlayersForFormat(input.teamFormat)
  const halfLength = Math.max(1, Math.round(input.halfLengthMinutes))
  const attending = Math.max(0, Math.floor(input.attendingCount))
  const gkFull = Boolean(input.gkPlaysFullHalf)

  const fieldPositions = Math.max(1, formatSize - (gkFull ? 1 : 0))
  const availableFieldPlayers = Math.max(0, attending - (gkFull ? 1 : 0))
  const totalFieldMinutes = fieldPositions * halfLength

  if (attending === 0) {
    return {
      formatSize,
      fieldPositions,
      availableFieldPlayers: 0,
      totalFieldMinutes,
      targetMinutesPerPlayer: 0,
      subIntervalMinutes: 0,
      subIntervalSeconds: 0,
      ok: false,
      message: 'Mark players attending to calculate a sub interval.',
    }
  }

  if (gkFull && attending < 2) {
    return {
      formatSize,
      fieldPositions,
      availableFieldPlayers,
      totalFieldMinutes,
      targetMinutesPerPlayer: 0,
      subIntervalMinutes: 0,
      subIntervalSeconds: 0,
      ok: false,
      message: 'Need at least one outfield player besides the goalkeeper.',
    }
  }

  if (availableFieldPlayers < fieldPositions) {
    return {
      formatSize,
      fieldPositions,
      availableFieldPlayers,
      totalFieldMinutes,
      targetMinutesPerPlayer: halfLength,
      subIntervalMinutes: halfLength,
      subIntervalSeconds: halfLength * 60,
      ok: true,
      message: 'Fewer outfield players than field spots — everyone can play the full half.',
    }
  }

  const targetMinutesPerPlayer = totalFieldMinutes / availableFieldPlayers
  const subIntervalMinutes = Math.max(1, Math.round(targetMinutesPerPlayer))

  return {
    formatSize,
    fieldPositions,
    availableFieldPlayers,
    totalFieldMinutes,
    targetMinutesPerPlayer,
    subIntervalMinutes,
    subIntervalSeconds: subIntervalMinutes * 60,
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
