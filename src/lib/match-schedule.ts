import type { DbMatch } from '@/types/database'

/** YYYY-MM-DD for <input type="date"> */
export function defaultMatchDate(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/** HH:MM for <input type="time"> */
export function defaultMatchTime(): string {
  const now = new Date()
  const hours = String(now.getHours()).padStart(2, '0')
  const minutes = String(now.getMinutes()).padStart(2, '0')
  return `${hours}:${minutes}`
}

/** Combine local date + time into timestamptz for legacy `date` column. */
export function matchDateTimeIso(matchDate: string, matchTime: string): string {
  const date = matchDate.trim() || defaultMatchDate()
  const time = matchTime.trim() || defaultMatchTime()
  const normalizedTime = time.length === 5 ? `${time}:00` : time
  const parsed = new Date(`${date}T${normalizedTime}`)
  if (Number.isNaN(parsed.getTime())) return new Date().toISOString()
  return parsed.toISOString()
}

/** Normalize Postgres time (HH:MM:SS) to HH:MM for inputs. */
export function normalizeMatchTimeForInput(value: string | null | undefined): string {
  if (!value) return defaultMatchTime()
  return value.slice(0, 5)
}

/** Sort key for completed-match lists (newest first). */
export function getMatchSortTimestamp(match: DbMatch): number {
  const date = match.match_date ?? match.date.slice(0, 10)
  const time = normalizeMatchTimeForInput(match.match_time ?? undefined)
  const parsed = new Date(`${date}T${time}:00`)
  if (!Number.isNaN(parsed.getTime())) return parsed.getTime()
  const fallback = new Date(match.date)
  return Number.isNaN(fallback.getTime()) ? 0 : fallback.getTime()
}

export function formatMatchDisplayDateTime(match: DbMatch): { dateLabel: string; timeLabel: string } {
  const dateStr = match.match_date ?? match.date.slice(0, 10)
  const timeStr = match.match_time ? normalizeMatchTimeForInput(match.match_time) : null

  const dateObj = new Date(`${dateStr}T12:00:00`)
  const dateLabel = Number.isNaN(dateObj.getTime())
    ? dateStr
    : dateObj.toLocaleDateString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })

  let timeLabel = '—'
  if (timeStr) {
    const [hours, minutes] = timeStr.split(':').map(Number)
    const t = new Date()
    t.setHours(hours, minutes ?? 0, 0, 0)
    timeLabel = t.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  } else {
    const full = new Date(match.date)
    if (!Number.isNaN(full.getTime())) {
      timeLabel = full.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
    }
  }

  return { dateLabel, timeLabel }
}
