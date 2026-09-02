import {
  formatParentTimelineRowCopy,
  isParentTimelineHighlight,
  type ParentTimelineRow,
} from '@/lib/parent-hub'
import { cn } from '@/lib/utils'

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
