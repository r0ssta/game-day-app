import { useEffect, useMemo } from 'react'
import { Crosshair, Shield, X } from 'lucide-react'
import { buildSidelineNameMap, getSidelineName } from '@/lib/player-names'
import { cn } from '@/lib/utils'
import { MODAL_OVERLAY, MODAL_PANEL, TOUCH_ICON_BUTTON } from '@/lib/layout'
import { SHOT_TYPES, type ShotType } from '@/schemas/match-actions'
import type { MatchPlayer } from '@/types/match'

function formatJersey(number: number | null) {
  return number !== null ? String(number) : '—'
}

export type ShotSaveTagKind = 'shot' | 'save'
export type ShotSaveTagSide = 'home' | 'away'
export type ShotSaveTagStep = 'type' | 'player'

type ShotSaveTagSheetProps = {
  open: boolean
  kind: ShotSaveTagKind
  side: ShotSaveTagSide
  step: ShotSaveTagStep
  shotType: ShotType | null
  players: MatchPlayer[]
  onSelectType: (shotType: ShotType) => void
  onSelectPlayer: (playerId: string) => void
  onDontTag: () => void
  onClose: () => void
}

export function ShotSaveTagSheet({
  open,
  kind,
  side,
  step,
  shotType,
  players,
  onSelectType,
  onSelectPlayer,
  onDontTag,
  onClose,
}: ShotSaveTagSheetProps) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const onFieldPlayers = useMemo(
    () => players.filter((player) => player.attending && player.isOnField),
    [players],
  )
  const sidelineNameMap = useMemo(
    () => buildSidelineNameMap(players.filter((player) => player.attending)),
    [players],
  )

  if (!open) return null

  const ours = side === 'home'
  const kindLabel = kind === 'shot' ? 'Shot' : 'Save'
  const teamLabel = ours ? `Our ${kindLabel}` : `Opponent ${kindLabel}`
  const heading = step === 'type' ? 'What kind?' : 'Who shot?'
  const ariaLabel = step === 'type' ? `${teamLabel}: shot type` : `${teamLabel}: ${heading}`

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel}
      className={cn(MODAL_OVERLAY, 'shot-save-tag-sheet')}
      onClick={onClose}
    >
      <div
        className={cn(MODAL_PANEL, 'min-h-0 border-2 border-border')}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between px-5 pb-3 pt-4">
          <div>
            <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
              {kind === 'shot' ? (
                <Crosshair className="size-4 text-neon" strokeWidth={2.5} />
              ) : (
                <Shield className="size-4 text-neon" strokeWidth={2.5} />
              )}
              {teamLabel}
              {step === 'player' ? ' · Step 2 of 2' : null}
            </div>
            <h2 className="font-display text-3xl font-black uppercase text-foreground">
              {heading}
            </h2>
            <p className="mt-1 text-sm font-bold text-muted-foreground">
              {step === 'type'
                ? 'Close cancels. Don’t tag still counts it.'
                : `${shotType ?? 'Shot'}. Close still logs it without a player.`}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className={`${TOUCH_ICON_BUTTON} shot-save-tag-close bg-secondary text-foreground`}
          >
            <X className="size-6" strokeWidth={3} />
          </button>
        </div>

        {step === 'type' ? (
          <div className="flex flex-col gap-3 px-4 pb-4">
            {SHOT_TYPES.map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => onSelectType(type)}
                className="shot-save-type min-h-16 touch-manipulation rounded-xl border-2 border-border bg-card px-4 py-5 text-left font-display text-xl font-black tracking-wide text-foreground transition-transform active:scale-[0.98] active:bg-secondary"
              >
                {type}
              </button>
            ))}
            <button
              type="button"
              onClick={onDontTag}
              className="shot-save-skip min-h-12 touch-manipulation rounded-xl border-2 border-dashed border-border bg-transparent px-4 py-3 font-display text-lg font-black uppercase tracking-wide text-muted-foreground transition-transform active:scale-[0.98]"
            >
              Don’t tag
            </button>
          </div>
        ) : (
          <>
            <div className="shrink-0 px-4 pb-3">
              <button
                type="button"
                onClick={onDontTag}
                className="shot-save-skip min-h-11 w-full touch-manipulation rounded-xl border-2 border-dashed border-border bg-transparent py-4 font-display text-lg font-black uppercase tracking-wide text-muted-foreground transition-transform active:scale-[0.98]"
              >
                Don’t tag
              </button>
            </div>
            {onFieldPlayers.length === 0 ? (
              <p className="px-4 pb-8 text-center text-sm font-semibold text-muted-foreground">
                No players on the field
              </p>
            ) : (
              <ul className="grid min-h-0 flex-1 grid-cols-1 gap-2 overflow-y-auto overscroll-contain px-4 pb-8 md:grid-cols-2 md:gap-3 lg:grid-cols-1">
                {onFieldPlayers.map((player) => (
                  <li key={player.id}>
                    <button
                      type="button"
                      onClick={() => onSelectPlayer(player.id)}
                      className="shot-save-player flex min-h-11 w-full touch-manipulation items-center gap-4 rounded-xl border-2 border-border bg-card px-4 py-4 text-left transition-transform active:scale-[0.98] active:bg-secondary"
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
            )}
          </>
        )}
      </div>
    </div>
  )
}
