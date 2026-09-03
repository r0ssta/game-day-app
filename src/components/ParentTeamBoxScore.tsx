import type { ParentTeamBoxScoreModel } from '@/lib/parent-box-score'
import type { TeamBoxScoreTotals } from '@/lib/match-shot-save'
import { cn } from '@/lib/utils'

const ROWS: Array<{ label: string; us: keyof TeamBoxScoreTotals; them: keyof TeamBoxScoreTotals }> =
  [
    { label: 'Goals', us: 'homeGoals', them: 'awayGoals' },
    { label: 'Shots', us: 'homeShots', them: 'awayShots' },
    { label: 'Corners', us: 'homeCorners', them: 'awayCorners' },
    { label: 'Saves', us: 'homeSaves', them: 'awaySaves' },
  ]

function ScorePair({
  us,
  them,
  emphasize,
}: {
  us: number
  them: number
  emphasize?: boolean
}) {
  return (
    <span
      className={cn(
        'font-mono text-sm font-bold tabular-nums sm:text-base',
        emphasize ? 'text-foreground' : 'text-foreground/90',
      )}
    >
      <span className="text-neon">{us}</span>
      <span className="text-muted-foreground">–</span>
      <span>{them}</span>
    </span>
  )
}

export function ParentMatchLengthRow({
  setupLengthTitle,
  setupLengthLabel,
  playedLengthLabel,
}: {
  setupLengthTitle: string
  setupLengthLabel: string
  playedLengthLabel: string
}) {
  return (
    <dl className="grid grid-cols-2 gap-3">
      <div>
        <dt className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
          {setupLengthTitle}
        </dt>
        <dd className="mt-0.5 text-sm font-bold text-foreground">{setupLengthLabel}</dd>
      </div>
      <div>
        <dt className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
          Game length
        </dt>
        <dd className="mt-0.5 font-mono text-sm font-bold tabular-nums text-foreground">
          {playedLengthLabel || '—'}
        </dd>
      </div>
    </dl>
  )
}

export function ParentTeamBoxScore({
  model,
  teamName,
  opponent,
}: {
  model: ParentTeamBoxScoreModel
  teamName: string
  opponent: string
}) {
  if (!model.hasStats && !model.playedLengthLabel) return null

  const us = teamName.trim() || 'Home'
  const them = opponent.trim() || 'Opponent'
  const columns = [...model.periodLabels, 'Total']
  const buckets = [...model.periods, model.total]

  return (
    <div className="mt-4 space-y-3 border-t border-border/70 pt-4">
      <ParentMatchLengthRow
        setupLengthTitle={model.setupLengthTitle}
        setupLengthLabel={model.setupLengthLabel}
        playedLengthLabel={model.playedLengthLabel}
      />

      {model.hasStats ? (
        <div>
          <p className="text-[10px] font-bold uppercase leading-snug tracking-widest text-muted-foreground">
            <span className="text-neon">{us}</span>
            <span className="text-muted-foreground"> – </span>
            {them}
          </p>
          <div className="mt-2 w-full min-w-0">
            <table className="w-full table-fixed border-collapse text-center">
              <caption className="sr-only">
                Goals, shots, corners, and saves by half for {us} versus {them}
              </caption>
              <colgroup>
                <col className="w-[26%]" />
                {columns.map((label) => (
                  <col key={label} />
                ))}
              </colgroup>
              <thead>
                <tr className="border-b border-border">
                  <th
                    scope="col"
                    className="py-1.5 pr-1.5 text-left text-[10px] font-bold uppercase tracking-widest text-muted-foreground"
                  >
                    <span className="sr-only">Stat</span>
                  </th>
                  {columns.map((label, index) => (
                    <th
                      key={label}
                      scope="col"
                      className={cn(
                        'px-0.5 py-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground',
                        index === columns.length - 1 && 'rounded-sm bg-secondary/50',
                      )}
                    >
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ROWS.map((row) => (
                  <tr key={row.label} className="border-b border-border/60 last:border-b-0">
                    <th
                      scope="row"
                      className="py-2 pr-1.5 text-left text-[11px] font-bold uppercase tracking-wide text-muted-foreground"
                    >
                      {row.label}
                    </th>
                    {buckets.map((bucket, index) => {
                      const isTotal = index === buckets.length - 1
                      return (
                        <td
                          key={`${row.label}-${columns[index]}`}
                          className={cn('px-0.5 py-2', isTotal && 'rounded-sm bg-secondary/50')}
                        >
                          <ScorePair
                            us={bucket[row.us]}
                            them={bucket[row.them]}
                            emphasize={isTotal}
                          />
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  )
}
