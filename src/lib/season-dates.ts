/** Season month range helpers — months stored as YYYY-MM-01 dates. */

export type SeasonMonthInput = {
  startMonth: string // YYYY-MM
  endMonth: string // YYYY-MM
}

export function monthValueToDate(monthValue: string): string | null {
  const trimmed = monthValue.trim()
  if (!/^\d{4}-\d{2}$/.test(trimmed)) return null
  const [yearRaw, monthRaw] = trimmed.split('-')
  const year = Number(yearRaw)
  const month = Number(monthRaw)
  if (!Number.isInteger(year) || year < 2000 || year > 2100) return null
  if (!Number.isInteger(month) || month < 1 || month > 12) return null
  return `${trimmed}-01`
}

export function dateToMonthValue(date: string | null | undefined): string {
  if (!date) return ''
  const match = /^(\d{4}-\d{2})/.exec(date)
  return match?.[1] ?? ''
}

const MONTH_LABELS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const

export function formatMonthYear(date: string | null | undefined): string | null {
  const monthValue = dateToMonthValue(date)
  if (!monthValue) return null
  const [yearRaw, monthRaw] = monthValue.split('-')
  const monthIndex = Number(monthRaw) - 1
  if (monthIndex < 0 || monthIndex > 11) return null
  return `${MONTH_LABELS[monthIndex]} ${yearRaw}`
}

export function formatSeasonDateRange(
  startsOn: string | null | undefined,
  endsOn: string | null | undefined,
): string | null {
  const start = formatMonthYear(startsOn)
  const end = formatMonthYear(endsOn)
  if (start && end) return `${start} – ${end}`
  if (start) return `From ${start}`
  if (end) return `Through ${end}`
  return null
}

export function defaultSeasonMonthValues(now = new Date()): SeasonMonthInput {
  const year = now.getFullYear()
  const month = now.getMonth() + 1 // 1-12
  const startMonth = `${year}-${String(month).padStart(2, '0')}`
  // Default end: +8 months (typical school-year / club season span)
  const endDate = new Date(year, month - 1 + 8, 1)
  const endMonth = `${endDate.getFullYear()}-${String(endDate.getMonth() + 1).padStart(2, '0')}`
  return { startMonth, endMonth }
}
