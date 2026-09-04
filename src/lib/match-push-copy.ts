/**
 * Pure push-notification copy builders — safe for browser and Node.
 * Keep free of `window` / DOM / Supabase / Vite env.
 */

import { parseOpponentGoalCategory } from '@/schemas/match-actions'
import { formatPeriodLong, type TotalPeriods } from './match-periods'

type NamedPlayer = {
  firstName?: string | null
  lastName?: string | null
  number?: number | null
  name?: string | null
}

function playerLabel(player: NamedPlayer): string {
  const name =
    player.name?.trim() ||
    [player.firstName, player.lastName].filter(Boolean).join(' ').trim() ||
    'Player'
  return player.number != null ? `#${player.number} ${name}` : name
}

export function buildMatchStartPush(input: {
  teamName: string
  opponent: string
  starters: NamedPlayer[]
  currentPeriod: number
  totalPeriods: TotalPeriods
}): { title: string; body: string } {
  const period = formatPeriodLong(input.currentPeriod, input.totalPeriods)
  const lineup =
    input.starters.length > 0 ? input.starters.map(playerLabel).join(', ') : 'TBD'
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
  totalPeriods: TotalPeriods
  homeScore?: number
  awayScore?: number
  starters?: NamedPlayer[]
}): { title: string; body: string } {
  const label = formatPeriodLong(input.period, input.totalPeriods)
  if (input.kind === 'start') {
    const lineup =
      input.starters && input.starters.length > 0
        ? input.starters.map(playerLabel).join(', ')
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

export function buildSubstitutionPush(input: {
  playerLabel: string
  direction: 'ON' | 'OFF'
  currentPeriod: number
  totalPeriods: TotalPeriods
}): { title: string; body: string } {
  const period = formatPeriodLong(input.currentPeriod, input.totalPeriods)
  return {
    title: 'Substitution',
    body: `${input.playerLabel} is subbing ${input.direction} the pitch in ${period}.`,
  }
}
