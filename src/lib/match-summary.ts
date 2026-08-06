import type { MatchPeriod, MatchPlayer } from '@/types/match'

export type MatchSummaryData = {
  teamName: string
  coachName: string
  opponent: string
  location: string
  tournamentGame: boolean
  homeScore: number
  awayScore: number
  seconds: number
  period: MatchPeriod
  halfLengthMinutes: number
  players: MatchPlayer[]
  clockSeconds: number
}

export function buildMatchSummaryText(data: MatchSummaryData): string {
  const lines = [
    'GAME DAY SUMMARY',
    '================',
    `Team: ${data.teamName}`,
    `Coach: ${data.coachName || '—'}`,
    `Opponent: ${data.opponent || '—'}`,
    `Location: ${data.location || '—'}`,
    `Tournament: ${data.tournamentGame ? 'Yes' : 'No'}`,
    `Final Score: ${data.homeScore} - ${data.awayScore}`,
    `Clock: ${formatSummaryClock(data.seconds)} (${data.period} half)`,
    '',
    'PLAYER MINUTES',
    '--------------',
    ...data.players
      .filter((p) => p.attending)
      .sort((a, b) => (a.number ?? 999) - (b.number ?? 999))
      .map((p) => {
        const totalSeconds =
          p.totalSecondsPlayed +
          (p.isOnField && p.subbedInAt !== null
            ? Math.max(0, data.clockSeconds - p.subbedInAt)
            : 0)
        return `${p.number !== null ? `#${p.number}` : '—'} ${p.name} (${p.matchPosition}) · ${Math.floor(totalSeconds / 60)}m · impact: ${p.impact}`
      }),
  ]
  return lines.join('\n')
}

function formatSummaryClock(totalSeconds: number) {
  const m = Math.floor(totalSeconds / 60)
  const s = totalSeconds % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export function toSummaryData(input: MatchSummaryData): MatchSummaryData {
  return input
}
