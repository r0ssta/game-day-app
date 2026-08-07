import { useEffect, useMemo } from 'react'
import { Goal, X } from 'lucide-react'
import { buildSidelineNameMap, getSidelineName } from '@/lib/player-names'
import { cn } from '@/lib/utils'
import { MODAL_OVERLAY, MODAL_PANEL, TOUCH_ICON_BUTTON } from '@/lib/layout'
import type { MatchPlayer } from '@/types/match'

function formatJersey(number: number | null) {
  return number !== null ? String(number) : '—'
}

type GoalWizardModalProps = {
  open: boolean
  step: 'scorer' | 'assist'
  players: MatchPlayer[]
  scorerId: string | null
  onSelectScorer: (player: MatchPlayer) => void
  onSelectAssist: (assistPlayerId: string | null) => void
  onClose: () => void
}

export function GoalWizardModal({
  open,
  step,
  players,
  scorerId,
  onSelectScorer,
  onSelectAssist,
  onClose,
}: GoalWizardModalProps) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const sidelineNameMap = useMemo(
    () => buildSidelineNameMap(players.filter((p) => p.attending)),
    [players],
  )

  if (!open) return null

  const onFieldPlayers = players.filter((p) => p.attending && p.isOnField)
  const assistCandidates = onFieldPlayers.filter((p) => p.id !== scorerId)
  const scorer = scorerId ? onFieldPlayers.find((p) => p.id === scorerId) : null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={step === 'scorer' ? 'Who scored?' : 'Who assisted?'}
      className={MODAL_OVERLAY}
      onClick={onClose}
    >
      <div
        className={cn(MODAL_PANEL, 'min-h-0')}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between px-5 pb-3 pt-4">
          <div>
            <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
              <Goal className="size-4 text-neon" strokeWidth={2.5} />
              Log Goal · Step {step === 'scorer' ? '1' : '2'} of 2
            </div>
            <h2 className="font-display text-3xl font-black uppercase text-neon">
              {step === 'scorer' ? 'Who scored?' : 'Who assisted?'}
            </h2>
            {step === 'assist' && scorer && (
              <p className="mt-1 text-sm font-semibold text-muted-foreground">
                Scorer: {scorer.number !== null ? `#${scorer.number} ` : ''}
                {getSidelineName(scorer, sidelineNameMap)}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className={`${TOUCH_ICON_BUTTON} bg-secondary text-foreground`}
          >
            <X className="size-6" strokeWidth={3} />
          </button>
        </div>

        {step === 'assist' && (
          <div className="shrink-0 px-4 pb-3">
            <button
              type="button"
              onClick={() => onSelectAssist(null)}
              className="min-h-11 w-full touch-manipulation rounded-xl border-2 border-border bg-card py-4 font-display text-2xl font-black uppercase tracking-wide text-foreground transition-transform active:scale-[0.98] active:bg-secondary md:py-5"
            >
              Unassisted
            </button>
          </div>
        )}

        <ul className="grid min-h-0 flex-1 grid-cols-1 gap-2 overflow-y-auto overscroll-contain px-4 pb-8 md:grid-cols-2 md:gap-3 lg:grid-cols-1">
          {(step === 'scorer' ? onFieldPlayers : assistCandidates).map((player) => (
            <li key={player.id}>
              <button
                type="button"
                onClick={() =>
                  step === 'scorer' ? onSelectScorer(player) : onSelectAssist(player.id)
                }
                className={cn(
                  'flex min-h-11 w-full touch-manipulation items-center gap-4 rounded-xl bg-card px-4 py-4 text-left transition-transform active:scale-[0.98] active:bg-secondary',
                  step === 'scorer' && 'border border-border',
                )}
              >
                <span className="flex size-14 shrink-0 items-center justify-center rounded-full border-2 border-neon/40 bg-neon/10 font-display text-2xl font-bold tabular-nums text-neon">
                  {formatJersey(player.number)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xl font-bold leading-tight text-foreground">
                    {getSidelineName(player, sidelineNameMap)}
                  </span>
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {player.matchPosition}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>

        {step === 'scorer' && onFieldPlayers.length === 0 && (
          <p className="px-4 pb-8 text-center text-sm font-semibold text-muted-foreground">
            No players on the field
          </p>
        )}
      </div>
    </div>
  )
}
