import { useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, ArrowUpDown, LineChart } from 'lucide-react'
import { AnalyticsModule } from '@/components/reporting/AnalyticsModule'
import { formatRecapMinutes } from '@/lib/match-recap'
import {
  formatMinutesLabel,
  type PlayingTimeAnalytics,
  type PlayingTimeEntry,
} from '@/lib/season-analytics'
import { formatRoleSplit } from '@/lib/season-reporting'
import { cn } from '@/lib/utils'

function formatJersey(number: number | null) {
  return number !== null ? String(number) : '—'
}

type SortKey =
  | 'name'
  | 'matchesPlayed'
  | 'firstHalfStarts'
  | 'secondHalfStarts'
  | 'averageFirstHalfSeconds'
  | 'averageSecondHalfSeconds'
  | 'averageMinutesPerMatch'
  | 'fieldPercent'

type PlayingTimeDashboardProps = {
  analytics: PlayingTimeAnalytics
}

function compareEntries(a: PlayingTimeEntry, b: PlayingTimeEntry, key: SortKey): number {
  if (key === 'name') return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
  const aValue = a[key] ?? -1
  const bValue = b[key] ?? -1
  return aValue - bValue
}

function SortHeader({
  label,
  title,
  sortKey,
  activeKey,
  direction,
  onSort,
}: {
  label: string
  title: string
  sortKey: SortKey
  activeKey: SortKey
  direction: 'asc' | 'desc'
  onSort: (key: SortKey) => void
}) {
  const active = activeKey === sortKey
  const Icon = !active ? ArrowUpDown : direction === 'asc' ? ArrowUp : ArrowDown
  return (
    <th
      scope="col"
      aria-sort={active ? (direction === 'asc' ? 'ascending' : 'descending') : 'none'}
      className="px-2 py-2 text-right font-bold"
    >
      <button
        type="button"
        title={title}
        onClick={() => onSort(sortKey)}
        className={cn(
          'inline-flex min-h-9 touch-manipulation items-center gap-1 text-[10px] font-bold uppercase tracking-wide',
          'ml-auto',
          active ? 'text-foreground' : 'text-muted-foreground',
        )}
      >
        {label}
        <Icon className="size-3.5 shrink-0" aria-hidden />
      </button>
    </th>
  )
}

export function PlayingTimeDashboard({ analytics }: PlayingTimeDashboardProps) {
  const [sortKey, setSortKey] = useState<SortKey>('averageMinutesPerMatch')
  const [direction, setDirection] = useState<'asc' | 'desc'>('desc')

  const rows = useMemo(() => {
    const sorted = [...analytics.leaders].sort((a, b) => compareEntries(a, b, sortKey))
    return direction === 'asc' ? sorted : sorted.reverse()
  }, [analytics.leaders, direction, sortKey])

  const onSort = (key: SortKey) => {
    if (key === sortKey) {
      setDirection((current) => (current === 'asc' ? 'desc' : 'asc'))
      return
    }
    setSortKey(key)
    setDirection(key === 'name' ? 'asc' : 'desc')
  }

  const summary = analytics.ironMan
    ? `Iron Man: ${analytics.ironMan.name} · ${formatMinutesLabel(analytics.ironMan.totalMinutes)}`
    : undefined

  return (
    <AnalyticsModule
      title="Playing Time"
      description="Starts and average minutes per game played. Missed games — injured or absent — stay out of the averages."
      icon={LineChart}
      defaultOpen
      summary={summary}
    >
      {rows.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[52rem] border-collapse text-sm">
            <caption className="sr-only">
              Playing time by player. Averages use games the player was in.
            </caption>
            <thead>
              <tr className="border-b border-border bg-secondary/40 text-left">
                <th
                  scope="col"
                  className="sticky left-0 z-10 bg-secondary px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wide text-muted-foreground"
                >
                  <button
                    type="button"
                    onClick={() => onSort('name')}
                    className={cn(
                      'inline-flex min-h-9 touch-manipulation items-center gap-1 text-[10px] font-bold uppercase tracking-wide',
                      sortKey === 'name' ? 'text-foreground' : 'text-muted-foreground',
                    )}
                  >
                    Player
                    {sortKey === 'name' ? (
                      direction === 'asc' ? (
                        <ArrowUp className="size-3.5" aria-hidden />
                      ) : (
                        <ArrowDown className="size-3.5" aria-hidden />
                      )
                    ) : (
                      <ArrowUpDown className="size-3.5" aria-hidden />
                    )}
                  </button>
                </th>
                <SortHeader
                  label="Games"
                  title="Games played. Injured or absent games are excluded."
                  sortKey="matchesPlayed"
                  activeKey={sortKey}
                  direction={direction}
                  onSort={onSort}
                />
                <SortHeader
                  label="1H Starts"
                  title="First half starts"
                  sortKey="firstHalfStarts"
                  activeKey={sortKey}
                  direction={direction}
                  onSort={onSort}
                />
                <SortHeader
                  label="2H Starts"
                  title="Second half starts"
                  sortKey="secondHalfStarts"
                  activeKey={sortKey}
                  direction={direction}
                  onSort={onSort}
                />
                <SortHeader
                  label="1H Avg"
                  title="Average playing time, first half"
                  sortKey="averageFirstHalfSeconds"
                  activeKey={sortKey}
                  direction={direction}
                  onSort={onSort}
                />
                <SortHeader
                  label="2H Avg"
                  title="Average playing time, second half"
                  sortKey="averageSecondHalfSeconds"
                  activeKey={sortKey}
                  direction={direction}
                  onSort={onSort}
                />
                <SortHeader
                  label="Total Avg"
                  title="Total average playing time per game played"
                  sortKey="averageMinutesPerMatch"
                  activeKey={sortKey}
                  direction={direction}
                  onSort={onSort}
                />
                <SortHeader
                  label="GK vs Field"
                  title="Share of playing time in goal versus on the field"
                  sortKey="fieldPercent"
                  activeKey={sortKey}
                  direction={direction}
                  onSort={onSort}
                />
              </tr>
            </thead>
            <tbody>
              {rows.map((entry) => (
                <tr key={entry.playerId} className="border-b border-border last:border-b-0">
                  <th
                    scope="row"
                    className="sticky left-0 z-10 bg-card px-3 py-2.5 text-left font-semibold text-foreground"
                  >
                    <span className="flex items-center gap-2">
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-full border border-neon/40 bg-neon/10 font-display text-xs font-bold tabular-nums text-neon">
                        {formatJersey(entry.jersey)}
                      </span>
                      <span className="truncate">{entry.name}</span>
                    </span>
                  </th>
                  <td className="px-2 py-2.5 text-right font-mono text-xs tabular-nums text-muted-foreground">
                    {entry.matchesPlayed}
                  </td>
                  <td className="px-2 py-2.5 text-right font-mono text-xs font-bold tabular-nums text-foreground">
                    {entry.firstHalfStarts}
                  </td>
                  <td className="px-2 py-2.5 text-right font-mono text-xs font-bold tabular-nums text-foreground">
                    {entry.secondHalfStarts}
                  </td>
                  <td className="px-2 py-2.5 text-right font-mono text-xs tabular-nums text-foreground">
                    {formatRecapMinutes(entry.averageFirstHalfSeconds)}
                  </td>
                  <td className="px-2 py-2.5 text-right font-mono text-xs tabular-nums text-foreground">
                    {formatRecapMinutes(entry.averageSecondHalfSeconds)}
                  </td>
                  <td className="px-2 py-2.5 text-right font-mono text-xs font-bold tabular-nums text-blue-400">
                    {formatRecapMinutes(entry.averageMinutesPerMatch)}
                  </td>
                  <td className="px-3 py-2.5 text-right text-xs font-semibold tabular-nums text-foreground">
                    {formatRoleSplit(entry.fieldPercent, entry.gkPercent)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm italic text-muted-foreground">No playing time data yet.</p>
      )}
    </AnalyticsModule>
  )
}
