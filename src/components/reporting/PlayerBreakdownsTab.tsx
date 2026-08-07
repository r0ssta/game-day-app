import { useMemo, useState } from 'react'
import { ChevronRight, Users } from 'lucide-react'
import { formatRecapMinutes } from '@/lib/match-recap'
import { formatPlusMinus } from '@/lib/plus-minus'
import { formatPlayerFullName } from '@/lib/player-names'
import {
  emptyPlayerSeasonStats,
  type PlayerSeasonStats,
  type SeasonReportData,
} from '@/lib/season-reporting'
import { cn } from '@/lib/utils'
import type { RosterPlayer } from '@/types/match'

function formatJersey(number: number | null) {
  return number !== null ? String(number) : '—'
}

type SortMode = 'jersey' | 'plusMinus'

type PlayerBreakdownsTabProps = {
  roster: RosterPlayer[]
  data: SeasonReportData
  onSelectPlayer: (playerId: string) => void
}

function PlayerRow({
  player,
  stats,
  onSelect,
}: {
  player: RosterPlayer
  stats: PlayerSeasonStats
  onSelect: () => void
}) {
  const name = formatPlayerFullName(player.firstName, player.lastName)

  return (
    <button
      type="button"
      onClick={onSelect}
      className="flex w-full items-center gap-3 rounded-xl border border-border bg-card px-3 py-3 text-left transition-colors active:bg-secondary/40"
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-full border-2 border-neon/50 bg-neon/10 font-display text-sm font-bold tabular-nums text-neon">
        {formatJersey(player.number)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-bold text-foreground">{name}</span>
        <span className="mt-0.5 block text-xs text-muted-foreground">
          {stats.matchesPlayed} matches · {formatRecapMinutes(stats.totalMinutes)} · {stats.goals}{' '}
          G · {stats.assists} A
        </span>
        <span className="mt-0.5 block text-xs text-muted-foreground">
          Overall +{stats.ratingCounts.positive} / ={stats.ratingCounts.neutral} / −
          {stats.ratingCounts.negative}
        </span>
      </span>
      <span
        className={cn(
          'shrink-0 rounded-lg px-2 py-1 text-center font-mono text-sm font-black tabular-nums',
          stats.plusMinus > 0
            ? 'bg-neon/15 text-neon'
            : stats.plusMinus < 0
              ? 'bg-danger/15 text-danger'
              : 'bg-secondary text-muted-foreground',
        )}
      >
        {formatPlusMinus(stats.plusMinus)}
      </span>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
    </button>
  )
}

export function PlayerBreakdownsTab({ roster, data, onSelectPlayer }: PlayerBreakdownsTabProps) {
  const [sortMode, setSortMode] = useState<SortMode>('jersey')

  const sortedRoster = useMemo(() => {
    const players = [...roster]
    if (sortMode === 'plusMinus') {
      return players.sort((a, b) => {
        const aStats = data.playerStats.get(a.id) ?? emptyPlayerSeasonStats(a.id)
        const bStats = data.playerStats.get(b.id) ?? emptyPlayerSeasonStats(b.id)
        return (
          bStats.plusMinus - aStats.plusMinus ||
          bStats.goals - aStats.goals ||
          (a.number ?? 999) - (b.number ?? 999)
        )
      })
    }
    return players.sort((a, b) => (a.number ?? 999) - (b.number ?? 999))
  }, [roster, data.playerStats, sortMode])

  if (sortedRoster.length === 0) {
    return (
      <p className="rounded-xl border border-border bg-card px-4 py-8 text-center text-sm text-muted-foreground">
        No players on this team yet. Add players in Team Management.
      </p>
    )
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="flex items-center gap-2 font-display text-base font-bold uppercase tracking-wide text-foreground">
          <Users className="size-5 text-athletic" />
          Season Player Profiles
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Tap a player for full stats. Sort by plus/minus to find your impact lineup.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {(
          [
            ['jersey', 'Jersey #'],
            ['plusMinus', '+/− Impact'],
          ] as const
        ).map(([mode, label]) => (
          <button
            key={mode}
            type="button"
            onClick={() => setSortMode(mode)}
            className={cn(
              'rounded-lg px-3 py-1.5 text-xs font-bold uppercase tracking-wide',
              sortMode === mode
                ? 'bg-neon text-neon-foreground'
                : 'bg-secondary text-muted-foreground',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="hidden rounded-lg border border-border bg-secondary/30 px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground sm:grid sm:grid-cols-[2.5rem_1fr_4rem_1rem] sm:gap-3">
        <span>#</span>
        <span>Player</span>
        <span className="text-right">+/−</span>
        <span />
      </div>

      <ul className="space-y-2">
        {sortedRoster.map((player) => {
          const stats = data.playerStats.get(player.id) ?? emptyPlayerSeasonStats(player.id)

          return (
            <li key={player.id}>
              <PlayerRow
                player={player}
                stats={stats}
                onSelect={() => onSelectPlayer(player.id)}
              />
            </li>
          )
        })}
      </ul>
    </div>
  )
}
