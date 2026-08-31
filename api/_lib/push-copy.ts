/**
 * Self-contained push copy for Vercel Node (no Vite `@/` aliases).
 */

export function buildGoalPush(input: {
  teamName: string
  opponent: string
  homeScore: number
  awayScore: number
  scorerLabel?: string
  assistLabel?: string | null
  isPk?: boolean
  ourGoal: boolean
}): { title: string; body: string } {
  const score = `${input.homeScore}–${input.awayScore}`
  if (!input.ourGoal) {
    return {
      title: `${input.teamName} · Goal conceded`,
      body: `${input.opponent || 'Opponent'}${input.isPk ? ' PK' : ''} · ${score}`,
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
