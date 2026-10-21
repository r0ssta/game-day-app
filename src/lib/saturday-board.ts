import { isLiveMatchStatus } from '@/lib/match-status'

export const DEFAULT_MINUTES_TARGET_RATIO = 0.5

export type SaturdayWindow = {
  start: string
  end: string
}

export type SaturdayMatch = {
  id: string
  teamId: string
  teamName: string
  opponent: string
  status: string
  matchDate: string | null
  matchTime: string | null
  homeScore: number
  awayScore: number
  period: string | null
}

export type MinutesShortfall = {
  playerId: string
  teamId: string
  teamName: string
  playerName: string
  playedMinutes: number
  targetMinutes: number
}

function isoDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/** Saturday and Sunday of this weekend, or the next one if today is Monday–Friday. */
export function weekendWindow(today: Date): SaturdayWindow {
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12, 0, 0, 0)
  const day = start.getDay()
  if (day === 0) start.setDate(start.getDate() - 1)
  else if (day !== 6) start.setDate(start.getDate() + (6 - day))
  const end = new Date(start)
  end.setDate(start.getDate() + 1)
  return { start: isoDate(start), end: isoDate(end) }
}

export function matchBelongsOnSaturdayBoard(
  match: { matchDate: string | null; status: string },
  window: SaturdayWindow,
): boolean {
  if (isLiveMatchStatus(match.status)) return true
  const day = match.matchDate?.slice(0, 10)
  if (!day) return false
  return day >= window.start && day <= window.end
}

export function playersUnderMinutesTarget(input: {
  teams: Array<{ id: string; name: string; ratio: number | null }>
  matches: Array<{ id: string; teamId: string; minutes: number; status: string }>
  stats: Array<{ matchId: string; playerId: string; seconds: number; guest: boolean }>
  roster: Array<{ playerId: string; teamId: string; playerName: string }>
}): MinutesShortfall[] {
  const completed = input.matches.filter(
    (match) => match.status === 'final' || match.status === 'pending_review',
  )
  const completedIds = new Set(completed.map((match) => match.id))
  const teamMinutes = new Map<string, number>()
  for (const match of completed) {
    teamMinutes.set(match.teamId, (teamMinutes.get(match.teamId) ?? 0) + match.minutes)
  }

  const teamIdByMatch = new Map(input.matches.map((match) => [match.id, match.teamId]))
  const played = new Map<string, number>()
  for (const stat of input.stats) {
    if (stat.guest || !completedIds.has(stat.matchId)) continue
    const teamId = teamIdByMatch.get(stat.matchId)
    if (!teamId) continue
    const key = `${stat.playerId}:${teamId}`
    played.set(key, (played.get(key) ?? 0) + stat.seconds / 60)
  }

  const teamById = new Map(input.teams.map((team) => [team.id, team]))
  const shortfalls: MinutesShortfall[] = []
  for (const player of input.roster) {
    const team = teamById.get(player.teamId)
    const available = teamMinutes.get(player.teamId) ?? 0
    if (!team || available <= 0) continue
    const ratio = team.ratio && team.ratio > 0 && team.ratio <= 1 ? team.ratio : DEFAULT_MINUTES_TARGET_RATIO
    const target = available * ratio
    const minutes = played.get(`${player.playerId}:${player.teamId}`) ?? 0
    if (minutes + 0.05 < target) {
      shortfalls.push({
        playerId: player.playerId,
        teamId: player.teamId,
        teamName: team.name,
        playerName: player.playerName,
        playedMinutes: Math.round(minutes),
        targetMinutes: Math.round(target),
      })
    }
  }

  return shortfalls.sort((a, b) => a.playedMinutes - b.playedMinutes || a.playerName.localeCompare(b.playerName))
}
