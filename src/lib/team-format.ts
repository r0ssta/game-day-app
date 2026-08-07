export type TeamFormat = '7v7' | '9v9' | '11v11'

export const TEAM_FORMATS: TeamFormat[] = ['7v7', '9v9', '11v11']

export const DEFAULT_TEAM_FORMAT: TeamFormat = '9v9'

export function normalizeTeamFormat(value: string | null | undefined): TeamFormat {
  if (value === '7v7' || value === '9v9' || value === '11v11') return value
  return DEFAULT_TEAM_FORMAT
}

export function getMaxFieldPlayersForFormat(format: TeamFormat): number {
  switch (format) {
    case '7v7':
      return 7
    case '9v9':
      return 9
    case '11v11':
      return 11
  }
}

export function teamFormatLabel(format: TeamFormat): string {
  return format
}
