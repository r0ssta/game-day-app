import { AlertCircle } from 'lucide-react'
import { formatMatchDisplayDateTime } from '@/lib/match-schedule'
import { formatOpponentPrefix, resolveMatchLocationType } from '@/lib/match-location'
import type { DbMatch } from '@/types/database'

type GameRecapNeededAlertsProps = {
  matches: DbMatch[]
  onOpenRecap: (matchId: string) => void
}

export function GameRecapNeededAlerts({ matches, onOpenRecap }: GameRecapNeededAlertsProps) {
  if (matches.length === 0) return null

  return (
    <section className="space-y-2">
      <div className="flex items-center gap-2">
        <AlertCircle className="size-4 shrink-0 text-athletic" />
        <h2 className="font-display text-xs font-bold uppercase tracking-widest text-athletic">
          Game Recap Needed
        </h2>
      </div>
      <ul className="space-y-2">
        {matches.map((match) => {
          const { dateLabel } = formatMatchDisplayDateTime(match)
          const locationType = resolveMatchLocationType(match)
          const opponentLabel = match.opponent.trim() || 'Opponent'

          return (
            <li key={match.id}>
              <button
                type="button"
                onClick={() => onOpenRecap(match.id)}
                className="w-full rounded-xl border-2 border-athletic/50 bg-athletic/10 px-4 py-4 text-left shadow-sm active:scale-[0.98]"
              >
                <span className="block font-display text-sm font-black uppercase tracking-wide text-athletic">
                  Finish Post-Game Recap
                </span>
                <span className="mt-1 block text-sm font-semibold text-foreground">
                  {dateLabel} · {formatOpponentPrefix(locationType)} {opponentLabel}
                </span>
                <span className="mt-1 block font-mono text-xs font-bold tabular-nums text-muted-foreground">
                  Final {match.home_score} – {match.away_score}
                </span>
                <span className="mt-2 block text-xs text-muted-foreground">
                  Player ratings and coach notes are saved as a draft until you finalize.
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
