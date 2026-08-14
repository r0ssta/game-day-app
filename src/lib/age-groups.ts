import type { TeamFormat } from '@/lib/team-format'
import { CLUB_NAME } from '@/lib/branding'

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

/** Stored team name default — age group is shown as a prefix in the UI, not in the DB name. */
export function defaultTeamNameForAgeGroup(
  _ageGroup?: AgeGroup,
  clubName = CLUB_NAME,
): string {
  return clubName
}

/** Strip a leading/trailing age-group token from a stored team name. */
export function stripAgeGroupFromTeamName(
  name: string,
  ageGroup?: AgeGroup | null,
): string {
  let base = name.trim()
  if (!base) return ''

  const groups = ageGroup ? [ageGroup] : [...AGE_GROUPS]
  for (const group of groups) {
    const leading = new RegExp(`^${group}\\s+`, 'i')
    const trailing = new RegExp(`\\s+${group}$`, 'i')
    base = base.replace(leading, '').replace(trailing, '').trim()
  }
  return base
}

/** Display label: age group in front of the team name everywhere in the UI. */
export function formatTeamDisplayName(
  name: string,
  ageGroup: string | null | undefined,
): string {
  const group = normalizeAgeGroup(ageGroup)
  const base = stripAgeGroupFromTeamName(name, group) || name.trim() || 'Team'
  if (!group) return base
  if (new RegExp(`^${group}\\b`, 'i').test(base)) return base
  return `${group} ${base}`
}
