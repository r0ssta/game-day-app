import type { LocationType } from '@/lib/match-location'

export type SprocketIcsMatch = {
  opponent: string
  matchDate: string
  matchTime: string
  locationType: LocationType
  locationLabel: string
  summary: string
  uid: string | null
}

export type SprocketIcsParseResult = {
  matches: SprocketIcsMatch[]
  skipped: Array<{ summary: string; reason: string }>
  warnings: string[]
}

function unfoldIcs(text: string): string {
  return text.replace(/\r\n/g, '\n').replace(/\n[ \t]/g, '')
}

function stripIcsValue(raw: string): string {
  let value = raw.trim()
  // Escape sequences
  value = value
    .replace(/\\n/gi, ' ')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\')
  // Drop mailto / uri wrappers if present
  if (value.toUpperCase().startsWith('MAILTO:')) {
    value = value.slice(7)
  }
  return value.trim()
}

function parseIcsDateTime(raw: string): { date: string; time: string } | null {
  const value = raw.trim()
  // Value may include TZID params already stripped; handle DATE or DATE-TIME
  const match = value.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?)?(Z)?$/i)
  if (!match) return null

  const [, y, m, d, hh, mm] = match
  const date = `${y}-${m}-${d}`
  if (!hh || !mm) {
    return { date, time: '00:00' }
  }
  return { date, time: `${hh}:${mm}` }
}

function extractProperty(block: string, name: string): string | null {
  const lines = block.split('\n')
  const upper = name.toUpperCase()
  for (const line of lines) {
    const colon = line.indexOf(':')
    if (colon === -1) continue
    const keyPart = line.slice(0, colon)
    const keyName = keyPart.split(';')[0].trim().toUpperCase()
    if (keyName !== upper) continue
    return stripIcsValue(line.slice(colon + 1))
  }
  return null
}

function extractOpponent(summary: string, teamNameHint?: string): string {
  const cleaned = summary.replace(/\s+/g, ' ').trim()
  if (!cleaned) return 'Opponent'

  const vsMatch = cleaned.match(/\b(?:vs\.?|v\.|versus)\s+(.+)$/i)
  if (vsMatch?.[1]) return vsMatch[1].replace(/^["']|["']$/g, '').trim() || 'Opponent'

  const atMatch = cleaned.match(/^@\s*(.+)$/)
  if (atMatch?.[1]) return atMatch[1].trim() || 'Opponent'

  if (teamNameHint) {
    const hint = teamNameHint.trim()
    if (hint && cleaned.toLowerCase().includes(hint.toLowerCase())) {
      const withoutTeam = cleaned
        .replace(new RegExp(hint.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'ig'), '')
        .replace(/\b(?:vs\.?|v\.|versus|at|@)\b/gi, '')
        .replace(/[-–—|/]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
      if (withoutTeam) return withoutTeam
    }
  }

  // "Home Team vs Away Team" split
  const parts = cleaned.split(/\s+vs\.?\s+/i)
  if (parts.length === 2) {
    const hintLower = teamNameHint?.trim().toLowerCase() ?? ''
    if (hintLower && parts[0].toLowerCase().includes(hintLower)) return parts[1].trim()
    if (hintLower && parts[1].toLowerCase().includes(hintLower)) return parts[0].trim()
    return parts[1].trim() || parts[0].trim() || 'Opponent'
  }

  return cleaned
}

function inferLocationType(summary: string, location: string): LocationType {
  const haystack = `${summary} ${location}`.toLowerCase()
  if (/(^|\b)(away|@)\b/.test(haystack) || haystack.includes('(away)')) return 'away'
  if (/(^|\b)home\b/.test(haystack) || haystack.includes('(home)')) return 'home'
  if (summary.trim().startsWith('@')) return 'away'
  return 'home'
}

export function parseSprocketScheduleIcs(
  text: string,
  options?: { teamName?: string },
): SprocketIcsParseResult {
  const unfolded = unfoldIcs(text)
  const warnings: string[] = []
  const skipped: SprocketIcsParseResult['skipped'] = []
  const matches: SprocketIcsMatch[] = []

  if (!/BEGIN:VCALENDAR/i.test(unfolded) && !/BEGIN:VEVENT/i.test(unfolded)) {
    return {
      matches: [],
      skipped: [{ summary: '', reason: 'File does not look like an ICS calendar export' }],
      warnings,
    }
  }

  const eventBlocks = unfolded.split(/BEGIN:VEVENT/i).slice(1)
  if (eventBlocks.length === 0) {
    return {
      matches: [],
      skipped: [{ summary: '', reason: 'No calendar events found' }],
      warnings,
    }
  }

  for (const rawBlock of eventBlocks) {
    const block = rawBlock.split(/END:VEVENT/i)[0] ?? rawBlock
    const summary = extractProperty(block, 'SUMMARY') ?? ''
    const dtStartRaw = extractProperty(block, 'DTSTART')
    const location = extractProperty(block, 'LOCATION') ?? ''
    const uid = extractProperty(block, 'UID')

    if (!dtStartRaw) {
      skipped.push({ summary: summary || '(untitled)', reason: 'Missing start date/time' })
      continue
    }

    const parsedStart = parseIcsDateTime(dtStartRaw)
    if (!parsedStart) {
      skipped.push({
        summary: summary || '(untitled)',
        reason: `Unrecognized date format "${dtStartRaw}"`,
      })
      continue
    }

    const opponent = extractOpponent(summary, options?.teamName)
    const locationType = inferLocationType(summary, location)

    matches.push({
      opponent,
      matchDate: parsedStart.date,
      matchTime: parsedStart.time,
      locationType,
      locationLabel: location,
      summary: summary || opponent,
      uid,
    })
  }

  if (matches.some((m) => m.matchTime === '00:00')) {
    warnings.push('Some events had no kickoff time — defaulted to noon; edit before game day.')
  }

  return { matches, skipped, warnings }
}
