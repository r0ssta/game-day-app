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
