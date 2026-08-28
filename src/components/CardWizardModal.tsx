import { useEffect, useMemo, useState } from 'react'
import { SquareAsterisk, X } from 'lucide-react'
import { buildSidelineNameMap, getSidelineName } from '@/lib/player-names'
import { cn } from '@/lib/utils'
import { MODAL_OVERLAY, MODAL_PANEL, TOUCH_ICON_BUTTON } from '@/lib/layout'
import type { CardKind } from '@/lib/match-cards'
import type { MatchPlayer } from '@/types/match'

function formatJersey(number: number | null) {
  return number !== null ? String(number) : '—'
}

type CardWizardModalProps = {
  open: boolean
  players: MatchPlayer[]
  onConfirm: (playerId: string, kind: CardKind) => void
  onClose: () => void
}

export function CardWizardModal({ open, players, onConfirm, onClose }: CardWizardModalProps) {
  const [kind, setKind] = useState<CardKind | null>(null)
  const [playerId, setPlayerId] = useState<string | null>(null)

  useEffect(() => {
    if (!open) {
      setKind(null)
      setPlayerId(null)
      return
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const eligible = useMemo(
    () => players.filter((p) => p.attending && !p.isSentOff),
    [players],
  )

  const sidelineNameMap = useMemo(
    () => buildSidelineNameMap(eligible),
    [eligible],
  )

  if (!open) return null

  const step: 'kind' | 'player' = kind ? 'player' : 'kind'
  const selected = playerId ? eligible.find((p) => p.id === playerId) : null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={step === 'kind' ? 'Log card type' : 'Select player for card'}
      className={MODAL_OVERLAY}
      onClick={onClose}
    >
      <div
        className={cn(MODAL_PANEL, 'min-h-0 border-2 border-border')}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <SquareAsterisk className="size-5 text-athletic" strokeWidth={2.5} />
            <h2 className="font-display text-lg font-bold uppercase tracking-wide text-foreground">
              Log Card
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className={TOUCH_ICON_BUTTON}
            aria-label="Close"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="space-y-4 overflow-y-auto p-4">
          {step === 'kind' ? (
            <>
              <p className="text-sm text-muted-foreground">Select card type</p>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setKind('yellow')}
                  className="flex min-h-20 flex-col items-center justify-center gap-2 rounded-xl border-2 border-amber-400/60 bg-amber-400/15 px-3 py-4 font-display text-sm font-black uppercase tracking-wide text-amber-700 active:scale-[0.98]"
                >
                  <span className="size-8 rounded-sm bg-amber-400 shadow" aria-hidden />
                  Yellow Card
                </button>
                <button
                  type="button"
                  onClick={() => setKind('red')}
                  className="flex min-h-20 flex-col items-center justify-center gap-2 rounded-xl border-2 border-danger/50 bg-danger/10 px-3 py-4 font-display text-sm font-black uppercase tracking-wide text-danger active:scale-[0.98]"
                >
                  <span className="size-8 rounded-sm bg-danger shadow" aria-hidden />
                  Red Card
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm text-muted-foreground">
                  Select player ·{' '}
                  <span className={kind === 'yellow' ? 'font-bold text-amber-600' : 'font-bold text-danger'}>
                    {kind === 'yellow' ? 'Yellow' : 'Red'}
                  </span>
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setKind(null)
                    setPlayerId(null)
                  }}
                  className="text-xs font-bold uppercase tracking-wide text-athletic"
                >
                  Back
                </button>
              </div>

              {eligible.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  No eligible players
                </p>
              ) : (
                <ul className="space-y-2">
                  {eligible.map((player) => (
                    <li key={player.id}>
                      <button
                        type="button"
                        onClick={() => setPlayerId(player.id)}
                        className={cn(
                          'flex min-h-12 w-full items-center gap-3 rounded-xl border-2 px-3 py-3 text-left active:scale-[0.98]',
                          playerId === player.id
                            ? 'border-neon bg-neon/10'
                            : 'border-border bg-card',
                        )}
                      >
                        <span className="flex size-10 shrink-0 items-center justify-center rounded-full border-2 border-border bg-secondary font-display text-sm font-bold tabular-nums">
                          {formatJersey(player.number)}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-bold text-foreground">
                            {getSidelineName(player, sidelineNameMap)}
                          </span>
                          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                            {player.isOnField ? 'On field' : 'Bench'}
                            {player.yellowCardCount > 0 ? ' · 1 Yellow' : ''}
                          </span>
                        </span>
                        {player.yellowCardCount > 0 ? (
                          <span
                            className="size-3 shrink-0 rounded-[2px] bg-amber-400"
                            title="Already has a yellow"
                            aria-label="Already has a yellow"
                          />
                        ) : null}
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              <button
                type="button"
                disabled={!selected || !kind}
                onClick={() => {
                  if (!selected || !kind) return
                  onConfirm(selected.id, kind)
                }}
                className="flex min-h-12 w-full items-center justify-center rounded-xl bg-neon px-4 py-3 font-display text-sm font-black uppercase tracking-wide text-neon-foreground disabled:opacity-40"
              >
                Confirm Card
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
