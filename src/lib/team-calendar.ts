export type TeamCalendarEvent = {
  id: string
  opponent: string
  status: string
  matchDate: string | null
  matchTime: string | null
  date: string | null
  locationType: string | null
  placeName: string | null
  placeDetails: string | null
  arrivalNote: string | null
  periodLength: number | null
  totalPeriods: number | null
  halfLength: number | null
}

export type TeamCalendarFeed = {
  teamName: string
  teamSlug: string
  ageGroup: string | null
  events: TeamCalendarEvent[]
}

function icsEscape(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;')
}

function foldIcsLine(line: string): string {
  if (line.length <= 73) return line
  const parts: string[] = []
  let rest = line
  parts.push(rest.slice(0, 73))
  rest = rest.slice(73)
  while (rest.length > 0) {
    parts.push(` ${rest.slice(0, 72)}`)
    rest = rest.slice(72)
  }
  return parts.join('\r\n')
}

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

function icsStamp(date: string, time: string | null): string | null {
  const day = date.slice(0, 10).replace(/-/g, '')
  if (!/^\d{8}$/.test(day)) return null
  const match = (time ?? '12:00').match(/^(\d{2}):(\d{2})/)
  const hh = match?.[1] ?? '12'
  const mm = match?.[2] ?? '00'
  return `${day}T${hh}${mm}00`
}

function addMinutes(stamp: string, minutes: number): string {
  const year = Number(stamp.slice(0, 4))
  const month = Number(stamp.slice(4, 6))
  const day = Number(stamp.slice(6, 8))
  const hour = Number(stamp.slice(9, 11))
  const minute = Number(stamp.slice(11, 13))
  const next = new Date(year, month - 1, day, hour, minute + minutes, 0, 0)
  return `${next.getFullYear()}${pad(next.getMonth() + 1)}${pad(next.getDate())}T${pad(next.getHours())}${pad(next.getMinutes())}00`
}

function eventMinutes(event: TeamCalendarEvent): number {
  const length = event.periodLength ?? event.halfLength ?? 30
  const periods = event.totalPeriods === 3 ? 3 : 2
  return Math.max(15, length * periods)
}

function icsStatus(status: string): string {
  if (status === 'cancelled') return 'CANCELLED'
  if (status === 'postponed') return 'TENTATIVE'
  return 'CONFIRMED'
}

export function calendarHttpsUrl(origin: string, slug: string): string {
  const base = origin.replace(/\/$/, '')
  return `${base}/api/calendar/${encodeURIComponent(slug)}`
}

export function calendarWebcalUrl(origin: string, slug: string): string {
  return calendarHttpsUrl(origin, slug).replace(/^https:/i, 'webcal:').replace(/^http:/i, 'webcal:')
}

export function buildTeamCalendarIcs(feed: TeamCalendarFeed, host = 'gameday'): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Game Day//Team Schedule//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${icsEscape(feed.teamName || 'Game Day')}`,
  ]

  for (const event of feed.events) {
    const day = event.matchDate ?? event.date
    if (!day) continue
    const start = icsStamp(day, event.matchTime)
    if (!start) continue
    const end = addMinutes(start, eventMinutes(event))
    const where = [event.placeName, event.locationType === 'away' ? 'Away' : 'Home', event.placeDetails]
      .filter((part) => part && part.trim())
      .join(' · ')
    const description = [event.arrivalNote, event.status === 'postponed' ? 'Postponed' : null]
      .filter((part) => part && part.trim())
      .join('\n')
    lines.push('BEGIN:VEVENT')
    lines.push(`UID:${event.id}@${host}`)
    lines.push(`DTSTAMP:${start}`)
    lines.push(`DTSTART:${start}`)
    lines.push(`DTEND:${end}`)
    lines.push(`SUMMARY:${icsEscape(`${feed.teamName || 'Game Day'} vs ${event.opponent || 'Opponent'}`)}`)
    if (where) lines.push(`LOCATION:${icsEscape(where)}`)
    if (description) lines.push(`DESCRIPTION:${icsEscape(description)}`)
    lines.push(`STATUS:${icsStatus(event.status)}`)
    lines.push('END:VEVENT')
  }

  lines.push('END:VCALENDAR')
  return lines.map(foldIcsLine).join('\r\n') + '\r\n'
}
