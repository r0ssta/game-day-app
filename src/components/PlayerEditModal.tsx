import { useEffect } from 'react'
import { X } from 'lucide-react'
import {
  RosterPositionFields,
} from '@/components/RosterPositionFields'
import type { RosterProfilePosition } from '@/lib/positions'
import { cn } from '@/lib/utils'
import { MODAL_OVERLAY, MODAL_PANEL, TOUCH_ICON_BUTTON } from '@/lib/layout'

export type PlayerEditDraft = {
  id: string
  firstName: string
  lastName: string
  number: string
  isGuest: boolean
  primaryPosition: RosterProfilePosition
  secondaryPosition: RosterProfilePosition
}

export function PlayerEditModal({
  draft,
  onChange,
  onSave,
  onClose,
}: {
  draft: PlayerEditDraft | null
  onChange: (draft: PlayerEditDraft) => void
  onSave: () => void
  onClose: () => void
}) {
  useEffect(() => {
    if (!draft) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [draft, onClose])

  if (!draft) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Edit Player"
      className={MODAL_OVERLAY}
      onClick={onClose}
    >
      <div
        className={cn(MODAL_PANEL, 'min-h-0')}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between px-5 pb-3 pt-4">
          <h2 className="font-display text-2xl font-bold uppercase text-foreground">Edit Player</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className={`${TOUCH_ICON_BUTTON} bg-secondary text-foreground`}
          >
            <X className="size-6" strokeWidth={3} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-8">
          <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="player-first-name"
                className="mb-2 block text-xs font-bold uppercase tracking-widest text-muted-foreground"
              >
                First Name
              </label>
              <input
                id="player-first-name"
                type="text"
                required
                value={draft.firstName}
                onChange={(e) => onChange({ ...draft, firstName: e.target.value })}
                className="w-full rounded-xl border border-border bg-card px-4 py-3 text-lg font-semibold text-foreground focus:border-neon focus:outline-none focus:ring-2 focus:ring-neon/30"
              />
            </div>
            <div>
              <label
                htmlFor="player-last-name"
                className="mb-2 block text-xs font-bold uppercase tracking-widest text-muted-foreground"
              >
                Last Name
              </label>
              <input
                id="player-last-name"
                type="text"
                required
                value={draft.lastName}
                onChange={(e) => onChange({ ...draft, lastName: e.target.value })}
                className="w-full rounded-xl border border-border bg-card px-4 py-3 text-lg font-semibold text-foreground focus:border-neon focus:outline-none focus:ring-2 focus:ring-neon/30"
              />
            </div>
          </div>
          <div>
            <label
              htmlFor="player-number"
              className="mb-2 block text-xs font-bold uppercase tracking-widest text-muted-foreground"
            >
              Jersey Number
            </label>
            <input
              id="player-number"
              type="number"
              min={0}
              max={99}
              value={draft.number}
              onChange={(e) => onChange({ ...draft, number: e.target.value })}
              className="w-full rounded-xl border border-border bg-card px-4 py-3 text-lg font-semibold tabular-nums text-foreground focus:border-neon focus:outline-none focus:ring-2 focus:ring-neon/30"
            />
          </div>

          <RosterPositionFields
            idPrefix="edit-player-modal"
            primaryPosition={draft.primaryPosition}
            secondaryPosition={draft.secondaryPosition}
            onPrimaryChange={(value) => onChange({ ...draft, primaryPosition: value })}
            onSecondaryChange={(value) => onChange({ ...draft, secondaryPosition: value })}
          />

          <div className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3">
            <label htmlFor="edit-player-guest" className="text-sm font-bold text-foreground">
              Is Guest Player?
            </label>
            <button
              id="edit-player-guest"
              type="button"
              role="switch"
              aria-checked={draft.isGuest}
              onClick={() => onChange({ ...draft, isGuest: !draft.isGuest })}
              className={cn(
                'relative h-8 w-14 rounded-full transition-colors',
                draft.isGuest ? 'bg-athletic' : 'bg-secondary',
              )}
            >
              <span
                className={cn(
                  'absolute top-1 size-6 rounded-full bg-white shadow transition-transform',
                  draft.isGuest ? 'left-7' : 'left-1',
                )}
              />
            </button>
          </div>
          </div>

          <button
            type="button"
            onClick={onSave}
            disabled={!draft.firstName.trim() || !draft.lastName.trim()}
            className="mt-6 min-h-11 w-full touch-manipulation rounded-xl bg-athletic py-4 font-display text-xl font-bold uppercase tracking-wide text-athletic-foreground active:scale-[0.98] disabled:opacity-40"
          >
            Save Player
          </button>
        </div>
      </div>
    </div>
  )
}
