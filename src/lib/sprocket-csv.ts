import { parseLegacyPlayerName } from '@/lib/player-names'
import {
  DEFAULT_PRIMARY_POSITION,
  isRosterProfilePosition,
  type RosterProfilePosition,
} from '@/lib/positions'

export type SprocketCsvPlayer = {
  firstName: string
  lastName: string
  jersey: number | null
  primaryPosition: RosterProfilePosition
  rowNumber: number
}

export type SprocketCsvParseResult = {
  players: SprocketCsvPlayer[]
  skipped: Array<{ rowNumber: number; reason: string }>
  warnings: string[]
}

const NAME_KEYS = ['name', 'player', 'player name', 'full name', 'athlete', 'athlete name']
const FIRST_KEYS = ['first name', 'first', 'fname', 'given name', 'player first name']
const LAST_KEYS = ['last name', 'last', 'lname', 'surname', 'family name', 'player last name']
const JERSEY_KEYS = [
  'jersey',
  'jersey #',
  'jersey number',
  'jersey no',
  'jersey no.',
  'number',
  '#',
  'bib',
  'bib number',
  'shirt number',
  'uniform number',
]
const POSITION_KEYS = [
  'position',
  'pos',
  'primary position',
  'player position',
  'preferred position',
  'roster position',
]

function normalizeHeader(value: string): string {
  return value
    .replace(/^\uFEFF/, '')
    .trim()
    .toLowerCase()
    .replace(/[_]+/g, ' ')
    .replace(/\s+/g, ' ')
}

function parseCsvRows(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let inQuotes = false

  const pushCell = () => {
    row.push(cell)
    cell = ''
  }
  const pushRow = () => {
    // Ignore trailing empty line
    if (row.length === 1 && row[0] === '' && rows.length > 0) {
      row = []
      return
    }
    rows.push(row)
    row = []
  }

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    const next = text[i + 1]

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        cell += '"'
        i++
      } else if (ch === '"') {
        inQuotes = false
      } else {
        cell += ch
      }
      continue
    }

    if (ch === '"') {
      inQuotes = true
      continue
    }
    if (ch === ',') {
      pushCell()
      continue
    }
    if (ch === '\n') {
      pushCell()
      pushRow()
      continue
    }
    if (ch === '\r') {
      continue
    }
    cell += ch
  }

  if (cell.length > 0 || row.length > 0) {
    pushCell()
    pushRow()
  }

  return rows
}

function findColumnIndex(headers: string[], candidates: string[]): number {
  for (const candidate of candidates) {
    const idx = headers.indexOf(candidate)
    if (idx !== -1) return idx
  }
  return -1
}

function parseJersey(raw: string): number | null | 'invalid' {
  const trimmed = raw.trim()
  if (!trimmed) return null
  const cleaned = trimmed.replace(/^#/, '').trim()
  if (!cleaned) return null
  const parsed = Number(cleaned)
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 99) return 'invalid'
  return parsed
}

export function mapSprocketPosition(raw: string): RosterProfilePosition {
  const value = raw.trim()
  if (!value) return DEFAULT_PRIMARY_POSITION
  if (isRosterProfilePosition(value)) return value

  const normalized = value.toLowerCase().replace(/[^a-z]/g, '')
  if (!normalized) return DEFAULT_PRIMARY_POSITION

  if (
    ['gk', 'goalkeeper', 'goalie', 'keeper', 'g', 'goal'].includes(normalized) ||
    normalized.startsWith('goal')
  ) {
    return 'Goalkeeper'
  }
  if (
    ['f', 'fw', 'fwd', 'forward', 'st', 'cf', 'striker', 'winger', 'lw', 'rw', 'attacker'].includes(
      normalized,
    ) ||
    normalized.includes('forward') ||
    normalized.includes('attack')
  ) {
    return 'Forward'
  }
  if (
    ['d', 'df', 'def', 'defender', 'cb', 'lb', 'rb', 'lcb', 'rcb', 'fullback', 'centreback', 'centerback'].includes(
      normalized,
    ) ||
    normalized.includes('defend') ||
    normalized.includes('back')
  ) {
    return 'Defender'
  }
  if (
    ['m', 'mf', 'mid', 'midfielder', 'cm', 'cdm', 'cam', 'lm', 'rm', 'dm', 'am'].includes(normalized) ||
    normalized.includes('mid')
  ) {
    return 'Midfielder'
  }

  return DEFAULT_PRIMARY_POSITION
}

export function parseSprocketRosterCsv(text: string): SprocketCsvParseResult {
  const rows = parseCsvRows(text)
  const skipped: SprocketCsvParseResult['skipped'] = []
  const warnings: string[] = []

  if (rows.length === 0) {
    return { players: [], skipped: [{ rowNumber: 1, reason: 'File is empty' }], warnings }
  }

  const headers = rows[0].map(normalizeHeader)
  const nameIdx = findColumnIndex(headers, NAME_KEYS)
  const firstIdx = findColumnIndex(headers, FIRST_KEYS)
  const lastIdx = findColumnIndex(headers, LAST_KEYS)
  const jerseyIdx = findColumnIndex(headers, JERSEY_KEYS)
  const positionIdx = findColumnIndex(headers, POSITION_KEYS)

  if (nameIdx === -1 && firstIdx === -1 && lastIdx === -1) {
    return {
      players: [],
      skipped: [
        {
          rowNumber: 1,
          reason: 'Missing name columns (expected Name, or First Name / Last Name)',
        },
      ],
      warnings,
    }
  }

  if (jerseyIdx === -1) {
    warnings.push('No jersey column found — players will be imported without jersey numbers.')
  }
  if (positionIdx === -1) {
    warnings.push(`No position column found — defaulting to ${DEFAULT_PRIMARY_POSITION}.`)
  }

  const players: SprocketCsvPlayer[] = []

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]
    const rowNumber = i + 1
    const cell = (idx: number) => (idx >= 0 ? (row[idx] ?? '').trim() : '')

    const isEntirelyEmpty = row.every((value) => !value.trim())
    if (isEntirelyEmpty) {
      skipped.push({ rowNumber, reason: 'Empty row' })
      continue
    }

    let firstName = ''
    let lastName = ''

    if (firstIdx !== -1 || lastIdx !== -1) {
      firstName = cell(firstIdx)
      lastName = cell(lastIdx)
    }

    if ((!firstName || !lastName) && nameIdx !== -1) {
      const parsed = parseLegacyPlayerName(cell(nameIdx))
      if (!firstName) firstName = parsed.firstName
      if (!lastName) lastName = parsed.lastName
    }

    if (!firstName && lastName) {
      firstName = lastName
      lastName = ''
    }

    if (!firstName) {
      skipped.push({ rowNumber, reason: 'Missing player name' })
      continue
    }

    let jersey: number | null = null
    if (jerseyIdx !== -1) {
      const parsedJersey = parseJersey(cell(jerseyIdx))
      if (parsedJersey === 'invalid') {
        skipped.push({ rowNumber, reason: `Invalid jersey number "${cell(jerseyIdx)}"` })
        continue
      }
      jersey = parsedJersey
    }

    const primaryPosition = mapSprocketPosition(cell(positionIdx))

    players.push({
      firstName,
      lastName,
      jersey,
      primaryPosition,
      rowNumber,
    })
  }

  return { players, skipped, warnings }
}
