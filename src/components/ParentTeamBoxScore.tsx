import type { ParentTeamBoxScoreModel } from '@/lib/parent-box-score'
import { formatPlayerShotScore } from '@/lib/shot-reporting'
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
                Goals, shots, corners, and saves by half for {us} versus {them}. Shot types and our shots by player follow when they were tagged.
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
          {model.cornerGoals.us + model.cornerGoals.them > 0 ? (
            <div className="mt-3 flex items-center justify-between gap-3 text-xs">
              <span className="font-semibold text-foreground">Goals from corners</span>
              <ScorePair us={model.cornerGoals.us} them={model.cornerGoals.them} />
            </div>
          ) : null}
          {model.shotTypes.length > 0 ? (
            <div className="mt-3">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                Shot types
              </p>
              <ul className="mt-1.5 space-y-1">
                {model.shotTypes.map((row) => (
                  <li key={row.type} className="flex items-center justify-between gap-3 text-xs">
                    <span className="font-semibold text-foreground">{row.type}</span>
                    <ScorePair us={row.us} them={row.them} />
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {model.playerShots.length > 0 ? (
            <div className="mt-3">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                Our shots
              </p>
              <ul className="mt-1.5 space-y-1">
                {model.playerShots.map((row) => (
                  <li key={row.playerId} className="flex items-baseline justify-between gap-3 text-xs">
                    <span className="min-w-0 truncate font-semibold text-foreground">{row.name}</span>
                    <span className="shrink-0 font-semibold tabular-nums text-muted-foreground">
                      {formatPlayerShotScore(row.shots, row.detail)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
