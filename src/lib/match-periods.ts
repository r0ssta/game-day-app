import type { MatchPeriod } from '@/types/match'
import type { DbMatch } from '@/types/database'
import { normalizeAgeGroup, type AgeGroup } from '@/lib/age-groups'
import type { TeamFormat } from '@/lib/team-format'

export type TotalPeriods = 2 | 3

export const PERIOD_LENGTH_OPTIONS_HALVES = [25, 30, 35, 40, 45] as const
export const PERIOD_LENGTH_OPTIONS_THREES = [15, 18, 20, 25, 30] as const

/** Three-period league format is only for U9/U10 (7v7). */
export function supportsThreePeriodFormat(input: {
  ageGroup?: string | null
  teamFormat?: TeamFormat | null
}): boolean {
  const age = normalizeAgeGroup(input.ageGroup)
  if (age === 'U9' || age === 'U10') return true
  // Age missing on older records — allow 7v7 as a fallback.
  if (!age && input.teamFormat === '7v7') return true
  return false
}

export function isTotalPeriods(value: unknown): value is TotalPeriods {
  return value === 2 || value === 3
}

export function defaultPeriodLengthMinutes(totalPeriods: TotalPeriods): number {
  return totalPeriods === 3 ? 18 : 30
}

export function periodLengthOptions(totalPeriods: TotalPeriods): readonly number[] {
  return totalPeriods === 3 ? PERIOD_LENGTH_OPTIONS_THREES : PERIOD_LENGTH_OPTIONS_HALVES
}

export function periodIndexToCode(index: number): MatchPeriod {
  if (index <= 1) return '1st'
  if (index === 2) return '2nd'
  return '3rd'
}

export function periodCodeToIndex(period: MatchPeriod | string | null | undefined): number {
  if (period === '2nd') return 2
  if (period === '3rd') return 3
  return 1
}

export function resolveTotalPeriods(match: Pick<DbMatch, 'total_periods'> | null | undefined): TotalPeriods {
  return match?.total_periods === 3 ? 3 : 2
}

export function resolvePeriodLengthMinutes(
  match: Pick<DbMatch, 'period_length' | 'half_length'> | null | undefined,
  fallback = 30,
): number {
  const fromPeriod = match?.period_length
  if (typeof fromPeriod === 'number' && fromPeriod > 0) return fromPeriod
  const fromHalf = match?.half_length
  if (typeof fromHalf === 'number' && fromHalf > 0) return fromHalf
  return fallback
}

export function resolveCurrentPeriod(
  match: Pick<DbMatch, 'current_period' | 'period'> | null | undefined,
): number {
  if (typeof match?.current_period === 'number' && match.current_period >= 1) {
    return Math.min(3, match.current_period)
  }
  return periodCodeToIndex(match?.period)
}

/** Compact clock badge: "1H"/"2H" for halves, "P1"/"P2"/"P3" for three periods. */
export function formatPeriodShort(currentPeriod: number, totalPeriods: TotalPeriods): string {
  if (totalPeriods === 2) {
    return currentPeriod <= 1 ? '1H' : '2H'
  }
  return `P${Math.min(Math.max(1, currentPeriod), totalPeriods)}`
}

export function formatPeriodLong(currentPeriod: number, totalPeriods: TotalPeriods): string {
  if (totalPeriods === 2) {
    return currentPeriod <= 1 ? '1st Half' : '2nd Half'
  }
  return `Period ${Math.min(Math.max(1, currentPeriod), totalPeriods)}`
}

export function startPeriodButtonLabel(currentPeriod: number, totalPeriods: TotalPeriods): string {
  return `Start ${formatPeriodLong(currentPeriod, totalPeriods)}`
}

export function endPeriodButtonLabel(
  currentPeriod: number,
  totalPeriods: TotalPeriods,
): string {
  if (currentPeriod >= totalPeriods) return 'End of Game'
  return `End ${formatPeriodLong(currentPeriod, totalPeriods)}`
}

export function intermissionTitle(endedPeriod: number, totalPeriods: TotalPeriods): string {
  if (totalPeriods === 2) return 'Halftime Setup'
  return `Break · After Period ${endedPeriod}`
}

export function nextPeriodLineupTitle(nextPeriod: number, totalPeriods: TotalPeriods): string {
  if (totalPeriods === 2) return '2nd Half Lineup'
  return `Period ${nextPeriod} Lineup`
}

export function startNextPeriodButtonLabel(nextPeriod: number, totalPeriods: TotalPeriods): string {
  return startPeriodButtonLabel(nextPeriod, totalPeriods)
}

/** Total regulation minutes for equal-play / sub math. */
export function totalMatchMinutes(totalPeriods: TotalPeriods, periodLengthMinutes: number): number {
  return Math.max(1, totalPeriods) * Math.max(1, Math.round(periodLengthMinutes))
}

/**
 * Resolve setup defaults when tournament / age-eligibility changes.
 * - Tournament → always 2 halves
 * - U9/U10 league → 3×18
 * - Everyone else → 2 halves
 */
export function resolveMatchFormatDefaults(input: {
  tournamentGame: boolean
  ageGroup?: string | null
  teamFormat?: TeamFormat | null
}): { totalPeriods: TotalPeriods; periodLengthMinutes: number } {
  if (input.tournamentGame || !supportsThreePeriodFormat(input)) {
    return {
      totalPeriods: 2,
      periodLengthMinutes: defaultPeriodLengthMinutes(2),
    }
  }
  return {
    totalPeriods: 3,
    periodLengthMinutes: defaultPeriodLengthMinutes(3),
  }
}

/** @deprecated Prefer resolveMatchFormatDefaults */
export function resolveMatchFormatForTournament(
  tournamentGame: boolean,
  ageGroup?: AgeGroup | string | null,
): {
  totalPeriods: TotalPeriods
  periodLengthMinutes: number
} {
  return resolveMatchFormatDefaults({ tournamentGame, ageGroup })
}

/** True when regulation has ended and the coach is on an intermission lineup screen. */
export function isIntermissionSetup(input: {
  periodClockStarted: boolean
  currentPeriod: number
  totalPeriods: TotalPeriods
  hasIntermissionLineup: boolean
}): boolean {
  return (
    input.hasIntermissionLineup &&
    !input.periodClockStarted &&
    input.currentPeriod >= 1 &&
    input.currentPeriod < input.totalPeriods
  )
}
