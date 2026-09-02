import {
  hasTeamShotSaveTotals,
  namedTeamBoxScoreRows,
  type TeamShotSaveTotals,
} from '@/lib/match-shot-save'

export function ParentTeamBoxScore({
  totals,
  teamName,
  opponent,
}: {
  totals: TeamShotSaveTotals
  teamName: string
  opponent: string
}) {
  if (!hasTeamShotSaveTotals(totals)) return null
  const us = teamName.trim() || 'Home'
  const them = opponent.trim() || 'Opponent'

  return (
    <div className="mt-4 space-y-3 border-t border-border/70 pt-4">
      {namedTeamBoxScoreRows(totals).map((row) => (
        <div key={row.label}>
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            {row.label}
          </p>
          <p className="mt-0.5 font-display text-lg font-bold leading-tight text-foreground">
            {us}{' '}
            <span className="font-mono tabular-nums text-neon">{row.us}</span>
            <span className="text-muted-foreground"> – </span>
            {them}{' '}
            <span className="font-mono tabular-nums">{row.them}</span>
          </p>
        </div>
      ))}
    </div>
  )
}
