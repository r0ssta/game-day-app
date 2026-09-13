import { formatPlusMinus } from '@/lib/plus-minus'
import { fetchPlayerImpact } from '@/lib/supabase-api'
import type { DbPlayerImpact } from '@/types/database'

export type PlayerImpactRow = DbPlayerImpact

export type PlayerImpactSortKey =
  | 'goal_plus_minus'
  | 'net_shot_differential'
  | 'total_seconds_played'

export type DifferentialTone = 'positive' | 'negative' | 'neutral'

export function differentialTone(value: number): DifferentialTone {
  if (value > 0) return 'positive'
  if (value < 0) return 'negative'
  return 'neutral'
}

export function formatImpactMinutes(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds))
  const minutes = Math.floor(safe / 60)
  const seconds = safe % 60
  if (seconds === 0) return `${minutes}`
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

export function formatImpactDifferential(value: number): string {
  return formatPlusMinus(value)
}

export function sortPlayerImpact(
  rows: PlayerImpactRow[],
  sortKey: PlayerImpactSortKey,
  direction: 'asc' | 'desc' = 'desc',
): PlayerImpactRow[] {
  const sign = direction === 'asc' ? 1 : -1
  return [...rows].sort((a, b) => {
    const delta = (a[sortKey] - b[sortKey]) * sign
    if (delta !== 0) return delta
    const name = a.last_name.localeCompare(b.last_name) || a.first_name.localeCompare(b.first_name)
    if (name !== 0) return name
    return (a.jersey ?? 999) - (b.jersey ?? 999)
  })
}

export async function loadPlayerImpact(input: {
  seasonId?: string | null
  teamId?: string | null
}): Promise<PlayerImpactRow[]> {
  return fetchPlayerImpact(input)
}
