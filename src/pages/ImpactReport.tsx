import { useMemo, useState, type ReactNode } from 'react'
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react'
import { ScreenHeader } from '@/components/AppNavigation'
import { PlayingTimeBar } from '@/components/PlayingTimeBar'
import { usePlayerImpact } from '@/hooks/usePlayerImpact'
import { APP_CONTAINER, APP_SHELL } from '@/lib/layout'
import { maxPlayingTimeSeconds } from '@/lib/playing-time-bar'
import {
  differentialTone,
  formatImpactDifferential,
  sortPlayerImpact,
  type PlayerImpactRow,
  type PlayerImpactSortKey,
} from '@/lib/player-impact'
import { formatPlayerFullName } from '@/lib/player-names'
import { cn } from '@/lib/utils'

function jerseyLabel(jersey: number | null): string {
  return jersey !== null ? String(jersey) : '—'
}

function DifferentialPill({ value }: { value: number }) {
  const tone = differentialTone(value)
  return (
    <span
      className={cn(
        'inline-flex min-w-12 items-center justify-center rounded-full px-2 py-0.5 font-mono text-xs font-black tabular-nums',
        tone === 'positive' && 'bg-neon/15 text-neon',
        tone === 'negative' && 'bg-danger/15 text-danger',
        tone === 'neutral' && 'bg-secondary text-muted-foreground',
      )}
    >
      {formatImpactDifferential(value)}
    </span>
  )
}

function SortHeader({
  label,
  sortKey,
  activeKey,
  direction,
  onSort,
  align = 'right',
}: {
  label: string
  sortKey: PlayerImpactSortKey
  activeKey: PlayerImpactSortKey
  direction: 'asc' | 'desc'
  onSort: (key: PlayerImpactSortKey) => void
  align?: 'left' | 'right'
}) {
  const active = activeKey === sortKey
  const Icon = !active ? ArrowUpDown : direction === 'asc' ? ArrowUp : ArrowDown

  return (
    <th
      scope="col"
      aria-sort={active ? (direction === 'asc' ? 'ascending' : 'descending') : 'none'}
      className={cn('px-2 py-2 font-bold', align === 'right' ? 'text-right' : 'text-left')}
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={cn(
          'inline-flex min-h-9 touch-manipulation items-center gap-1 text-[10px] font-bold uppercase tracking-wide',
          align === 'right' && 'ml-auto',
          active ? 'text-foreground' : 'text-muted-foreground',
        )}
      >
        {label}
        <Icon className="size-3.5" aria-hidden />
      </button>
    </th>
  )
}

function ImpactTable({
  rows,
  sortKey,
  direction,
  onSort,
}: {
  rows: PlayerImpactRow[]
  sortKey: PlayerImpactSortKey
  direction: 'asc' | 'desc'
  onSort: (key: PlayerImpactSortKey) => void
}) {
  const maxSeconds = maxPlayingTimeSeconds(rows)
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <table className="w-full min-w-[40rem] border-collapse text-sm">
        <thead>
          <tr className="border-b border-border bg-secondary/40 text-left">
            <th scope="col" className="px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
              Player
            </th>
            <SortHeader
              label="Goal +/-"
              sortKey="goal_plus_minus"
              activeKey={sortKey}
              direction={direction}
              onSort={onSort}
            />
            <SortHeader
              label="Net Shots"
              sortKey="net_shot_differential"
              activeKey={sortKey}
              direction={direction}
              onSort={onSort}
            />
            <SortHeader
              label="Minutes"
              sortKey="total_seconds_played"
              activeKey={sortKey}
              direction={direction}
              onSort={onSort}
            />
            <th
              scope="col"
              className="px-2 py-2 text-right text-[10px] font-bold uppercase tracking-wide text-muted-foreground"
            >
              Matches
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const name = formatPlayerFullName(row.first_name, row.last_name)
            return (
              <tr key={`${row.team_id}:${row.player_id}`} className="border-b border-border last:border-b-0">
                <th scope="row" className="px-3 py-2.5 text-left font-semibold text-foreground">
                  <span className="flex items-center gap-2">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-full border border-neon/40 bg-neon/10 font-display text-xs font-bold tabular-nums text-neon">
                      {jerseyLabel(row.jersey)}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate">{name}</span>
                      <span className="block text-[11px] font-medium text-muted-foreground">
                        {row.team_goals} GF · {row.opponent_goals} GA · {row.team_shots} / {row.opponent_shots} shots
                        {row.total_gk_seconds > 0
                          ? ` · 🧤 ${row.gk_goals_conceded} GA · ${row.gk_saves} SV`
                          : ''}
                      </span>
                    </span>
                  </span>
                </th>
                <td className="px-2 py-2.5 text-right">
                  <DifferentialPill value={row.goal_plus_minus} />
                </td>
                <td className="px-2 py-2.5 text-right">
                  <DifferentialPill value={row.net_shot_differential} />
                </td>
                <td className="min-w-[7.5rem] px-2 py-2.5">
                  <PlayingTimeBar
                    fieldSeconds={row.total_field_seconds}
                    gkSeconds={row.total_gk_seconds}
                    maxSeconds={maxSeconds}
                  />
                </td>
                <td className="px-2 py-2.5 text-right font-mono text-xs tabular-nums text-muted-foreground">
                  {row.matches_played}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export type ImpactReportProps = {
  activeTeamId: string | null
  activeSeasonId: string | null
  teamSwitcher?: ReactNode
  onBackToHome: () => void
}

export function ImpactReport({
  activeTeamId,
  activeSeasonId,
  teamSwitcher,
  onBackToHome,
}: ImpactReportProps) {
  const { rows, loading, error, reload } = usePlayerImpact({
    teamId: activeTeamId,
    seasonId: activeSeasonId,
  })
  const [sortKey, setSortKey] = useState<PlayerImpactSortKey>('goal_plus_minus')
  const [direction, setDirection] = useState<'asc' | 'desc'>('desc')

  const sortedRows = useMemo(
    () => sortPlayerImpact(rows, sortKey, direction),
    [rows, sortKey, direction],
  )

  const handleSort = (key: PlayerImpactSortKey) => {
    if (key === sortKey) {
      setDirection((current) => (current === 'desc' ? 'asc' : 'desc'))
      return
    }
    setSortKey(key)
    setDirection('desc')
  }

  return (
    <main className={`${APP_SHELL} pb-10 md:pb-12`}>
      <div className={`${APP_CONTAINER} space-y-5 pt-6 md:space-y-6 md:pt-8`}>
        <ScreenHeader
          title="Player Impact"
          subtitle="On-pitch goal +/- and shot differential while each player was on the field. Goalkeeper minutes are timed separately and excluded from field +/-."
          onHome={onBackToHome}
          teamSwitcher={teamSwitcher}
        />

        {!activeTeamId ? (
          <p className="rounded-xl border border-border bg-card px-4 py-8 text-center text-sm text-muted-foreground">
            Select an active team above to view impact.
          </p>
        ) : loading ? (
          <p className="py-8 text-center text-sm font-semibold text-muted-foreground">
            Calculating player impact…
          </p>
        ) : error ? (
          <div className="rounded-xl border border-danger/40 bg-card p-6 text-center">
            <p className="font-bold text-danger">Failed to load player impact</p>
            <p className="mt-2 text-sm text-muted-foreground">{error}</p>
            <button
              type="button"
              onClick={reload}
              className="mt-4 min-h-11 rounded-xl bg-neon px-4 text-sm font-bold uppercase tracking-wide text-neon-foreground"
            >
              Try again
            </button>
          </div>
        ) : sortedRows.length === 0 ? (
          <p className="rounded-xl border border-border bg-card px-4 py-8 text-center text-sm text-muted-foreground">
            No rostered players yet. Add players in Team Management, then complete a match with
            substitutions and events.
          </p>
        ) : (
          <ImpactTable
            rows={sortedRows}
            sortKey={sortKey}
            direction={direction}
            onSort={handleSort}
          />
        )}
      </div>
    </main>
  )
}
