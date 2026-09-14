export type PlayingTimeLabelVariant = 'compact' | 'verbose'

export function formatPlayingTimeBarLabel(
  fieldSeconds: number,
  gkSeconds: number,
  variant: PlayingTimeLabelVariant = 'compact',
): string {
  const fieldMin = Math.floor(Math.max(0, fieldSeconds) / 60)
  const gkMin = Math.floor(Math.max(0, gkSeconds) / 60)
  if (fieldMin <= 0 && gkMin <= 0) return '0m'
  if (variant === 'verbose') {
    if (gkMin <= 0) return `${fieldMin}m field`
    if (fieldMin <= 0) return `${gkMin}m GK`
    return `${fieldMin}m field · ${gkMin}m GK`
  }
  if (gkMin <= 0) return `${fieldMin}m 👟`
  if (fieldMin <= 0) return `${gkMin}m 🧤`
  return `${fieldMin}m 👟 | ${gkMin}m 🧤`
}

export function playingTimeBarPercents(
  fieldSeconds: number,
  gkSeconds: number,
  maxSeconds: number,
): { fieldPct: number; gkPct: number } {
  const field = Math.max(0, fieldSeconds)
  const gk = Math.max(0, gkSeconds)
  const max = Math.max(maxSeconds, field + gk, 1)
  return {
    fieldPct: (field / max) * 100,
    gkPct: (gk / max) * 100,
  }
}

export function maxPlayingTimeSeconds(
  rows: Array<{
    total_seconds_played?: number
    total_field_seconds?: number
    total_gk_seconds?: number
    totalSeconds?: number
    fieldSeconds?: number
    gkSeconds?: number
  }>,
): number {
  if (rows.length === 0) return 1
  return Math.max(
    1,
    ...rows.map((row) => {
      const split =
        (row.total_field_seconds ?? row.fieldSeconds ?? 0) +
        (row.total_gk_seconds ?? row.gkSeconds ?? 0)
      return Math.max(row.total_seconds_played ?? row.totalSeconds ?? 0, split)
    }),
  )
}
