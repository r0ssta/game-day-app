import { useEffect, useMemo } from 'react'
import { Goal, X } from 'lucide-react'
import { buildSidelineNameMap, getSidelineName } from '@/lib/player-names'
import { cn } from '@/lib/utils'
import { MODAL_OVERLAY, MODAL_PANEL, TOUCH_ICON_BUTTON } from '@/lib/layout'
import type { MatchPlayer } from '@/types/match'

function formatJersey(number: number | null) {
  return number !== null ? String(number) : '—'
}

export type GoalWizardTeam = 'us' | 'opponent'
export type GoalWizardStep = 'goal_type' | 'scorer' | 'assist'

type GoalWizardModalProps = {
  open: boolean
  team: GoalWizardTeam
  step: GoalWizardStep
  isPk: boolean
  players: MatchPlayer[]
  scorerId: string | null
  onSelectGoalType: (isPk: boolean) => void
  onSelectScorer: (player: MatchPlayer) => void
  onSelectAssist: (assistPlayerId: string | null) => void
  onClose: () => void
}

export function GoalWizardModal({
  open,
  team,
  step,
  isPk,
  players,
  scorerId,
  onSelectGoalType,
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
  const teamLabel = team === 'us' ? 'Our Goal' : 'Opponent Goal'
  const totalSteps = team === 'opponent' ? 1 : isPk || step === 'goal_type' ? 2 : 3
  const stepNumber =
    step === 'goal_type' ? 1 : step === 'scorer' ? 2 : 3

  const ariaLabel =
    step === 'goal_type'
      ? `${teamLabel}: regular or penalty?`
      : step === 'scorer'
        ? 'Who scored?'
        : 'Who assisted?'

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel}
      className={MODAL_OVERLAY}
      onClick={onClose}
    >
      <div
        className={cn(MODAL_PANEL, 'goal-log-dialog min-h-0 border-2 border-border')}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between px-5 pb-3 pt-4">
          <div>
            <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
              <Goal className="size-4 text-neon" strokeWidth={2.5} />
              {teamLabel}
              {step !== 'goal_type' ? ` · Step ${stepNumber} of ${totalSteps}` : null}
            </div>
            <h2 className="font-display text-3xl font-black uppercase text-neon">
              {step === 'goal_type'
                ? 'How scored?'
                : step === 'scorer'
                  ? 'Who scored?'
                  : 'Who assisted?'}
            </h2>
            {step === 'goal_type' ? (
              <p className="mt-1 text-sm font-bold text-foreground">
                {team === 'us'
                  ? 'Pick goal type, then the scorer.'
                  : 'Regular goal or penalty kick?'}
              </p>
            ) : null}
            {step === 'scorer' && isPk ? (
              <p className="mt-1 text-sm font-bold uppercase tracking-wide text-athletic">
                Penalty kick
              </p>
            ) : null}
            {step === 'assist' && scorer ? (
              <p className="mt-1 text-sm font-semibold text-muted-foreground">
                Scorer: {scorer.number !== null ? `#${scorer.number} ` : ''}
                {getSidelineName(scorer, sidelineNameMap)}
              </p>
            ) : null}
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

        {step === 'goal_type' ? (
          <div className="flex flex-col gap-3 px-4 pb-8">
            <button
              type="button"
              onClick={() => onSelectGoalType(false)}
              className="goal-log-regular min-h-16 touch-manipulation rounded-xl border-2 border-neon bg-neon px-4 py-5 font-display text-2xl font-black uppercase tracking-wide text-neon-foreground transition-transform active:scale-[0.98]"
            >
              Regular Goal
            </button>
            <button
              type="button"
              onClick={() => onSelectGoalType(true)}
              className="goal-log-pk min-h-16 touch-manipulation rounded-xl border-2 border-athletic bg-athletic/15 px-4 py-5 font-display text-2xl font-black uppercase tracking-wide text-athletic transition-transform active:scale-[0.98]"
            >
              Penalty Kick
            </button>
          </div>
        ) : null}

        {step === 'assist' ? (
          <div className="shrink-0 px-4 pb-3">
            <button
              type="button"
              onClick={() => onSelectAssist(null)}
              className="min-h-11 w-full touch-manipulation rounded-xl border-2 border-border bg-card py-4 font-display text-2xl font-black uppercase tracking-wide text-foreground transition-transform active:scale-[0.98] active:bg-secondary md:py-5"
            >
              Unassisted
            </button>
          </div>
        ) : null}

        {step === 'scorer' || step === 'assist' ? (
          <ul className="grid min-h-0 flex-1 grid-cols-1 gap-2 overflow-y-auto overscroll-contain px-4 pb-8 md:grid-cols-2 md:gap-3 lg:grid-cols-1">
            {(step === 'scorer' ? onFieldPlayers : assistCandidates).map((player) => (
              <li key={player.id}>
                <button
                  type="button"
                  onClick={() =>
                    step === 'scorer' ? onSelectScorer(player) : onSelectAssist(player.id)
                  }
                  className={cn(
                    'flex min-h-11 w-full touch-manipulation items-center gap-4 rounded-xl border-2 border-border bg-card px-4 py-4 text-left transition-transform active:scale-[0.98] active:bg-secondary',
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
        ) : null}

        {step === 'scorer' && onFieldPlayers.length === 0 ? (
          <p className="px-4 pb-8 text-center text-sm font-semibold text-muted-foreground">
            No players on the field
          </p>
        ) : null}
      </div>
    </div>
  )
}
