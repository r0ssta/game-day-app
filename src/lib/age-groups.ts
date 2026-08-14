import type { TeamFormat } from '@/lib/team-format'

/** Club age groups with default match formats. */
export const AGE_GROUPS = ['U9', 'U10', 'U11', 'U12', 'U13', 'U14', 'U15', 'U16'] as const

export type AgeGroup = (typeof AGE_GROUPS)[number]

export function isAgeGroup(value: unknown): value is AgeGroup {
  return typeof value === 'string' && (AGE_GROUPS as readonly string[]).includes(value)
}

export function normalizeAgeGroup(value: string | null | undefined): AgeGroup | null {
  if (!value) return null
  const normalized = value.trim().toUpperCase()
  return isAgeGroup(normalized) ? normalized : null
}

/** Default lineup format by age group. */
export function formatForAgeGroup(ageGroup: AgeGroup): TeamFormat {
  switch (ageGroup) {
    case 'U9':
    case 'U10':
      return '7v7'
    case 'U11':
    case 'U12':
      return '9v9'
    case 'U13':
    case 'U14':
    case 'U15':
    case 'U16':
      return '11v11'
  }
}

export function ageGroupLabel(ageGroup: AgeGroup): string {
  return ageGroup
}

export function ageGroupFormatHint(ageGroup: AgeGroup): string {
  return `${ageGroup} · ${formatForAgeGroup(ageGroup)}`
}

export function defaultTeamNameForAgeGroup(ageGroup: AgeGroup, clubName = 'Virginia Velocity'): string {
  return `${clubName} ${ageGroup}`
}
