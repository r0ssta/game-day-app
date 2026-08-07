import { ChevronRight, Users } from 'lucide-react'
import { formatRecapMinutes } from '@/lib/match-recap'
import { formatPlayerFullName } from '@/lib/player-names'
import {
  emptyPlayerSeasonStats,
  type PlayerSeasonStats,
  type SeasonReportData,
} from '@/lib/season-reporting'
import type { RosterPlayer } from '@/types/match'

function formatJersey(number: number | null) {
  return number !== null ? String(number) : '—'
}

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
          {stats.matchesPlayed} matches · {formatRecapMinutes(stats.totalMinutes)} total ·{' '}
          {stats.goals} G · Overall +{stats.ratingCounts.positive} / ={stats.ratingCounts.neutral}{' '}
          / −{stats.ratingCounts.negative}
        </span>
      </span>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
    </button>
  )
}

export function PlayerBreakdownsTab({ roster, data, onSelectPlayer }: PlayerBreakdownsTabProps) {
  const sortedRoster = [...roster].sort((a, b) => (a.number ?? 999) - (b.number ?? 999))

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
          Tap a player to view aggregated season stats, ratings, and coaching notes.
        </p>
      </div>

      <ul className="space-y-2">
        {sortedRoster.map((player) => {
          const stats =
            data.playerStats.get(player.id) ?? emptyPlayerSeasonStats(player.id)

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
