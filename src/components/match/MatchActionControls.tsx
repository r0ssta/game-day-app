import type { ReactNode } from 'react'
import { APP_CONTAINER } from '@/lib/layout'
import { endPeriodButtonLabel } from '@/lib/match-periods'
import type { TotalPeriods } from '@/types/match'

export function PeriodStartButton({
  label,
  onStart,
}: {
  label: string
  onStart: () => void
}) {
  return (
    <button
      type="button"
      onClick={onStart}
      className="w-full min-h-14 touch-manipulation rounded-2xl bg-neon py-5 font-display text-2xl font-black uppercase tracking-wide text-neon-foreground shadow-xl shadow-neon/30 transition-transform active:scale-[0.98] active:brightness-95"
    >
      {label}
    </button>
  )
}

export function StickyMatchActionBar({ children }: { children: ReactNode }) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t-2 border-border bg-background/95 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur">
      <div className={`${APP_CONTAINER} space-y-2`}>{children}</div>
    </div>
  )
}

export function EndPeriodButton({
  currentPeriod,
  totalPeriods,
  onEndPeriod,
  onEndGame,
}: {
  currentPeriod: number
  totalPeriods: TotalPeriods
  onEndPeriod: () => void
  onEndGame: () => void
}) {
  const isLastPeriod = currentPeriod >= totalPeriods

  return (
    <button
      type="button"
      onClick={isLastPeriod ? onEndGame : onEndPeriod}
      className="w-full min-h-14 touch-manipulation rounded-2xl bg-orange-600 py-5 font-display text-2xl font-black uppercase tracking-wider text-white shadow-xl shadow-orange-600/40 transition-transform active:scale-[0.98] active:brightness-95"
    >
      {endPeriodButtonLabel(currentPeriod, totalPeriods)}
    </button>
  )
}
