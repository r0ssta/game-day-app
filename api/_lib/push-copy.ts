/**
 * Self-contained push copy for Vercel Node (no Vite `@/` aliases).
 */

import { parseOpponentGoalCategory } from './match-action-schemas.js'

export function buildGoalPush(input: {
  teamName: string
  opponent: string
  homeScore: number
  awayScore: number
  scorerLabel?: string
  assistLabel?: string | null
  isPk?: boolean
  ourGoal: boolean
  eventNotes?: string | null
}): { title: string; body: string } {
  const score = `${input.homeScore}–${input.awayScore}`
  if (!input.ourGoal) {
    const category = parseOpponentGoalCategory(input.eventNotes)
    const how = category ? ` · ${category}` : input.isPk ? ' PK' : ''
    return {
      title: `${input.teamName} · Goal conceded`,
      body: `${input.opponent || 'Opponent'}${how} · ${score}`,
    }
  }
  const how = input.isPk
    ? 'PK'
    : input.assistLabel
      ? `assist ${input.assistLabel}`
      : 'unassisted'
  return {
    title: `${input.teamName} · GOAL!`,
    body: `${input.scorerLabel ?? 'Player'} (${how}) · ${score} vs ${input.opponent || 'Opponent'}`,
  }
}

export function buildFullTimePush(input: {
  teamName: string
  opponent: string
  homeScore: number
  awayScore: number
  pkNote?: string
}): { title: string; body: string } {
  return {
    title: `${input.teamName} · Final`,
    body: `${input.homeScore}–${input.awayScore} vs ${input.opponent || 'Opponent'}${input.pkNote ? ` · ${input.pkNote}` : ''}`,
  }
}

export function buildCardPush(input: {
  playerLabel: string
  kind: 'yellow' | 'red'
  isSecondYellow?: boolean
}): { title: string; body: string } {
  if (input.kind === 'red' || input.isSecondYellow) {
    return {
      title: 'Red card',
      body: input.isSecondYellow
        ? `${input.playerLabel} sent off (2nd yellow).`
        : `${input.playerLabel} sent off.`,
    }
  }
  return { title: 'Yellow card', body: `${input.playerLabel} booked.` }
}

function formatPeriodLong(currentPeriod: number, totalPeriods: 2 | 3): string {
  if (totalPeriods === 2) {
    return currentPeriod <= 1 ? '1st Half' : '2nd Half'
  }
  return `Period ${Math.min(Math.max(1, currentPeriod), totalPeriods)}`
}

export function buildSubstitutionPush(input: {
  playerLabel: string
  direction: 'ON' | 'OFF'
  currentPeriod: number
  totalPeriods: 2 | 3
}): { title: string; body: string } {
  const period = formatPeriodLong(input.currentPeriod, input.totalPeriods)
  return {
    title: 'Substitution',
    body: `${input.playerLabel} is subbing ${input.direction} the pitch in ${period}.`,
  }
}

export function buildMatchStartPush(input: {
  teamName: string
  opponent: string
  starterLabels: string[]
  currentPeriod: number
  totalPeriods: 2 | 3
}): { title: string; body: string } {
  const period = formatPeriodLong(input.currentPeriod, input.totalPeriods)
  const lineup =
    input.starterLabels.length > 0 ? input.starterLabels.join(', ') : 'TBD'
  return {
    title: `${input.teamName} · Starting lineup`,
    body: `${period} vs ${input.opponent || 'Opponent'}: ${lineup}`,
  }
}

export function buildPeriodPush(input: {
  teamName: string
  opponent: string
  kind: 'start' | 'end'
  period: number
  totalPeriods: 2 | 3
  homeScore?: number
  awayScore?: number
  starterLabels?: string[]
}): { title: string; body: string } {
  const label = formatPeriodLong(input.period, input.totalPeriods)
  if (input.kind === 'start') {
    const lineup =
      input.starterLabels && input.starterLabels.length > 0
        ? input.starterLabels.join(', ')
        : null
    return {
      title: lineup
        ? `${input.teamName} · ${label} lineup`
        : `${input.teamName} · ${label}`,
      body: lineup
        ? `${label} vs ${input.opponent || 'Opponent'}: ${lineup}`
        : `${label} underway vs ${input.opponent || 'Opponent'}.`,
    }
  }
  return {
    title: `${input.teamName} · ${label} ended`,
    body: `Score ${input.homeScore ?? 0}–${input.awayScore ?? 0} vs ${input.opponent || 'Opponent'}.`,
  }
}
