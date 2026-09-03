import {
  formatParentTimelineRowCopy,
  isParentTimelineHighlight,
  type ParentTimelineRow,
} from '@/lib/parent-hub'
import { cn } from '@/lib/utils'

export function LiveGameFeed({
  rows,
  opponent,
  teamName,
  emptyLabel = 'No live events recorded for this match.',
}: {
  rows: ParentTimelineRow[]
  opponent: string
  teamName: string
  emptyLabel?: string
}) {
  return (
    <section>
      <h2 className="mb-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">
        Live game feed
      </h2>
      {rows.length === 0 ? (
        <p className="rounded-xl border border-border bg-card px-4 py-6 text-center text-sm text-muted-foreground">
          {emptyLabel}
        </p>
      ) : (
        <ParentTimelineList rows={rows} opponent={opponent} teamName={teamName} />
      )}
    </section>
  )
}

export function ParentTimelineList({
  rows,
  opponent,
  teamName,
}: {
  rows: ParentTimelineRow[]
  opponent: string
  teamName: string
}) {
  return (
    <ul className="space-y-2">
      {rows.map((row) => {
        const copy = formatParentTimelineRowCopy(row, opponent, { teamName })
        const highlight = isParentTimelineHighlight(row)
        return (
          <li
            key={row.id}
            className={cn(
              'rounded-xl border px-3 py-2.5 text-sm font-semibold',
              highlight
                ? 'border-neon/50 bg-neon/10 text-foreground'
                : 'border-border bg-card text-foreground',
            )}
          >
            {copy.detail ? (
              <div>
                <p>{copy.title}</p>
                <p className="mt-1 text-xs font-medium leading-relaxed text-muted-foreground">
                  {copy.detail}
                </p>
              </div>
            ) : (
              copy.title
            )}
          </li>
        )
      })}
    </ul>
  )
}
