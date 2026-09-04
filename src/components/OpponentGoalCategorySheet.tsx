import { useEffect } from 'react'
import { Shield, X } from 'lucide-react'
import {
  OPPONENT_GOAL_CATEGORIES,
  type OpponentGoalCategory,
} from '@/schemas/match-actions'
import { cn } from '@/lib/utils'
import { MODAL_OVERLAY, MODAL_PANEL, TOUCH_ICON_BUTTON } from '@/lib/layout'

type OpponentGoalCategorySheetProps = {
  open: boolean
  onSelect: (category: OpponentGoalCategory) => void
  onSkip: () => void
  onClose: () => void
}

export function OpponentGoalCategorySheet({
  open,
  onSelect,
  onSkip,
  onClose,
}: OpponentGoalCategorySheetProps) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="How did they score?"
      className={cn(MODAL_OVERLAY, 'opponent-goal-sheet')}
      onClick={onClose}
    >
      <div
        className={cn(MODAL_PANEL, 'min-h-0 border-2 border-border')}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between px-5 pb-3 pt-4">
          <div>
            <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
              <Shield className="size-4 text-muted-foreground" strokeWidth={2.5} />
              Opponent Goal
            </div>
            <h2 className="font-display text-3xl font-black uppercase text-foreground">
              How scored?
            </h2>
            <p className="mt-1 text-sm font-bold text-muted-foreground">
              One tap logs the goal.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className={`${TOUCH_ICON_BUTTON} opponent-goal-sheet-close bg-secondary text-foreground`}
          >
            <X className="size-6" strokeWidth={3} />
          </button>
        </div>

        <div className="flex flex-col gap-3 px-4 pb-4">
          {OPPONENT_GOAL_CATEGORIES.map((category) => (
            <button
              key={category}
              type="button"
              onClick={() => onSelect(category)}
              className="opponent-goal-category min-h-16 touch-manipulation rounded-xl border-2 border-border bg-card px-4 py-5 text-left font-display text-xl font-black tracking-wide text-foreground transition-transform active:scale-[0.98] active:bg-secondary"
            >
              {category}
            </button>
          ))}
          <button
            type="button"
            onClick={onSkip}
            className="opponent-goal-skip min-h-12 touch-manipulation rounded-xl border-2 border-dashed border-border bg-transparent px-4 py-3 font-display text-lg font-black uppercase tracking-wide text-muted-foreground transition-transform active:scale-[0.98]"
          >
            Skip
          </button>
        </div>
      </div>
    </div>
  )
}
