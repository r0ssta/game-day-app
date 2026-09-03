import { cn } from '@/lib/utils'
import { QA_SPEED_MULTIPLIERS, type QaSpeedMultiplier } from '@/lib/match-clock'

export function QaSpeedControls({
  speed,
  onSpeedChange,
}: {
  speed: QaSpeedMultiplier
  onSpeedChange: (speed: QaSpeedMultiplier) => void
}) {
  return (
    <div className="w-full rounded-xl border border-orange-500/40 bg-orange-600/10 px-3 py-2">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="text-[10px] font-black uppercase tracking-widest text-orange-400">
          QA Test Speed
        </span>
        <span className="text-[10px] font-semibold text-orange-300/80">
          {speed === 1 ? 'Normal' : `${speed}×`}
        </span>
      </div>
      <div
        className="grid grid-cols-3 gap-1.5"
        role="group"
        aria-label="QA match clock speed"
      >
        {QA_SPEED_MULTIPLIERS.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => onSpeedChange(option)}
            aria-pressed={speed === option}
            className={cn(
              'min-h-10 touch-manipulation rounded-lg px-2 py-2 text-xs font-black tabular-nums uppercase tracking-wide transition-all active:scale-[0.97]',
              speed === option
                ? 'bg-orange-600 text-white shadow-md shadow-orange-600/30 ring-2 ring-orange-400/60'
                : 'border border-orange-500/30 bg-background/80 text-orange-200 hover:bg-orange-600/20',
            )}
          >
            {option}x
          </button>
        ))}
      </div>
    </div>
  )
}
