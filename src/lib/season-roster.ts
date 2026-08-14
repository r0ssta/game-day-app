import type { AgeGroup } from '@/lib/age-groups'
import {
  dbPlayerToRoster,
  type SeasonRosterEntry,
} from '@/lib/supabase-api'
import type { RosterPlayer } from '@/types/match'

export function seasonRosterToPlayers(
  entries: SeasonRosterEntry[],
  teamId: string,
): RosterPlayer[] {
  return entries.map((entry) =>
    dbPlayerToRoster(entry.player, {
      teamId,
      jersey: entry.roster.primary_jersey_number ?? entry.player.jersey,
      isGuest: false,
    }),
  )
}

export function poolPlayerToGuestRoster(
  player: Parameters<typeof dbPlayerToRoster>[0],
  teamId: string,
): RosterPlayer {
  return dbPlayerToRoster(player, {
    teamId,
    jersey: player.jersey,
    isGuest: true,
  })
}

export function resolveTeamAgeGroup(
  ageGroup: string | null | undefined,
  fallback: AgeGroup = 'U13',
): AgeGroup {
  const normalized = (ageGroup ?? '').trim().toUpperCase()
  const allowed: AgeGroup[] = ['U9', 'U10', 'U11', 'U12', 'U13', 'U14', 'U15', 'U16']
  return (allowed.includes(normalized as AgeGroup) ? normalized : fallback) as AgeGroup
}
