import { useEffect, useMemo } from 'react'
import { Goal, X } from 'lucide-react'
import { buildSidelineNameMap, getSidelineName } from '@/lib/player-names'
import { cn } from '@/lib/utils'
import { MODAL_OVERLAY, MODAL_PANEL, TOUCH_ICON_BUTTON } from '@/lib/layout'
import { SHOT_TYPES, type ShotType } from '@/schemas/match-actions'
import type { MatchPlayer } from '@/types/match'

function formatJersey(number: number | null) {
  return number !== null ? String(number) : '—'
}

export type GoalWizardTeam = 'us' | 'opponent'
export type GoalWizardStep = 'corner' | 'type' | 'scorer' | 'assist'

type GoalWizardModalProps = {
  open: boolean
  team: GoalWizardTeam
  step: GoalWizardStep
  /** True when this goal started with the corner question. */
  includesCornerStep: boolean
  shotType: ShotType | null
  players: MatchPlayer[]
  scorerId: string | null
  onSelectCorner: (fromCorner: boolean) => void
  onSelectType: (shotType: ShotType) => void
  onSelectScorer: (player: MatchPlayer) => void
  onSelectAssist: (assistPlayerId: string | null) => void
  onDontTag: () => void
  onClose: () => void
}

export function GoalWizardModal({
  open,
  team,
  step,
  includesCornerStep,
  shotType,
  players,
  scorerId,
  onSelectCorner,
  onSelectType,
  onSelectScorer,
  onSelectAssist,
  onDontTag,
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
  const teamLabel = team === 'us' ? 'Our Goal' : 'Opponent Goal'
  const asksForAssist = shotType !== 'PK'
  const typeSteps = asksForAssist ? 3 : 2
  const totalSteps = includesCornerStep ? typeSteps + 1 : typeSteps
  const stepNumber =
    step === 'corner'
      ? 1
      : step === 'type'
        ? includesCornerStep
          ? 2
          : 1
        : step === 'scorer'
          ? includesCornerStep
            ? 3
            : 2
          : includesCornerStep
            ? 4
            : 3
  const heading =
    step === 'corner'
      ? 'Was this goal a direct result of the corner?'
      : step === 'type'
        ? 'What kind?'
        : step === 'scorer'
          ? 'Who scored?'
          : 'Who assisted?'
  const ariaLabel =
    step === 'corner'
      ? `${teamLabel}: from a corner`
      : step === 'type'
        ? `${teamLabel}: shot type`
        : `${teamLabel}: ${heading}`

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel}
      className={cn(MODAL_OVERLAY, 'goal-log-dialog')}
      onClick={onClose}
    >
      <div
        className={cn(MODAL_PANEL, 'min-h-0 border-2 border-border')}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between px-5 pb-3 pt-4">
          <div>
            <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
              <Goal className="size-4 text-neon" strokeWidth={2.5} />
              {teamLabel}
              {team === 'us' && (includesCornerStep || step !== 'type')
                ? ` · Step ${stepNumber} of ${totalSteps}`
                : null}
            </div>
            <h2
              className={cn(
                'font-display font-black text-foreground',
                step === 'corner' ? 'text-2xl leading-tight' : 'text-3xl uppercase',
              )}
            >
              {heading}
            </h2>
            <p className="mt-1 text-sm font-bold text-muted-foreground">
              {step === 'corner'
                ? 'Close still logs the goal. Undo if it was a mistake.'
                : step === 'type'
                  ? 'Close still logs it. Don’t tag also counts it.'
                  : step === 'scorer'
                    ? `${shotType ?? 'Goal'}. Close still logs it without a player.`
                    : `${shotType ?? 'Goal'}${
                        scorer ? ` · ${getSidelineName(scorer, sidelineNameMap)}` : ''
                      }. Close still logs it.`}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className={`${TOUCH_ICON_BUTTON} goal-log-close bg-secondary text-foreground`}
          >
            <X className="size-6" strokeWidth={3} />
          </button>
        </div>

        {step === 'corner' ? (
          <div className="flex flex-col gap-3 px-4 pb-4">
            <button
              type="button"
              onClick={() => onSelectCorner(true)}
              className="goal-log-corner-yes min-h-16 touch-manipulation rounded-xl border-2 border-border bg-card px-4 py-5 text-left font-display text-xl font-black tracking-wide text-foreground transition-transform active:scale-[0.98] active:bg-secondary"
            >
              Yes
            </button>
            <button
              type="button"
              onClick={() => onSelectCorner(false)}
              className="goal-log-corner-no min-h-16 touch-manipulation rounded-xl border-2 border-border bg-card px-4 py-5 text-left font-display text-xl font-black tracking-wide text-foreground transition-transform active:scale-[0.98] active:bg-secondary"
            >
              No
            </button>
          </div>
        ) : null}

        {step === 'type' ? (
          <div className="flex flex-col gap-3 px-4 pb-4">
            {SHOT_TYPES.map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => onSelectType(type)}
                className="goal-log-type min-h-16 touch-manipulation rounded-xl border-2 border-border bg-card px-4 py-5 text-left font-display text-xl font-black tracking-wide text-foreground transition-transform active:scale-[0.98] active:bg-secondary"
              >
                {type}
              </button>
            ))}
            <button
              type="button"
              onClick={onDontTag}
              className="goal-log-skip min-h-12 touch-manipulation rounded-xl border-2 border-dashed border-border bg-transparent px-4 py-3 font-display text-lg font-black uppercase tracking-wide text-muted-foreground transition-transform active:scale-[0.98]"
            >
              Don’t tag
            </button>
          </div>
        ) : null}

        {step === 'scorer' || step === 'assist' ? (
          <>
            <div className="shrink-0 px-4 pb-3">
              <button
                type="button"
                onClick={step === 'scorer' ? onDontTag : () => onSelectAssist(null)}
                className="goal-log-skip min-h-11 w-full touch-manipulation rounded-xl border-2 border-dashed border-border bg-transparent py-4 font-display text-lg font-black uppercase tracking-wide text-muted-foreground transition-transform active:scale-[0.98]"
              >
                {step === 'scorer' ? 'Don’t tag' : 'Unassisted'}
              </button>
            </div>
            {(step === 'scorer' ? onFieldPlayers : assistCandidates).length === 0 ? (
              <p className="px-4 pb-8 text-center text-sm font-semibold text-muted-foreground">
                No players on the field
              </p>
            ) : (
              <ul className="grid min-h-0 flex-1 grid-cols-1 gap-2 overflow-y-auto overscroll-contain px-4 pb-8 md:grid-cols-2 md:gap-3 lg:grid-cols-1">
                {(step === 'scorer' ? onFieldPlayers : assistCandidates).map((player) => (
                  <li key={player.id}>
                    <button
                      type="button"
                      onClick={() =>
                        step === 'scorer' ? onSelectScorer(player) : onSelectAssist(player.id)
                      }
                      className="goal-log-player flex min-h-11 w-full touch-manipulation items-center gap-4 rounded-xl border-2 border-border bg-card px-4 py-4 text-left transition-transform active:scale-[0.98] active:bg-secondary"
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
        ) : null}
      </div>
    </div>
  )
}
