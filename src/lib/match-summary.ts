import type { MatchPeriod, MatchPlayer } from '@/types/match'
import { formatOpponentWithVenue } from '@/lib/match-location'
import { formatPlayerFullName } from '@/lib/player-names'
import { getLiveSecondsPlayed } from '@/lib/play-time'

export type MatchSummaryData = {
  teamName: string
  coachName: string
  opponent: string
  locationType: 'home' | 'away'
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
    `Opponent: ${formatOpponentWithVenue(data.opponent, data.locationType)}`,
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
        const totalSeconds = getLiveSecondsPlayed(p, data.clockSeconds)
        return `${p.number !== null ? `#${p.number}` : '—'} ${formatPlayerFullName(p.firstName, p.lastName)} (${p.matchPosition}) · ${Math.floor(totalSeconds / 60)}m · impact: ${p.impact}`
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
