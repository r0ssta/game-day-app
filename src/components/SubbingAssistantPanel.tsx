import {
  calculateSubRotationPlan,
  SUB_FREQUENCY_OPTIONS,
  type SubFrequency,
  type SubRotationPlan,
} from '@/lib/sub-rotation'
import { ENABLE_SUB_ASSISTANT } from '@/lib/feature-flags'
import type { TeamFormat } from '@/lib/team-format'
import { cn } from '@/lib/utils'
import { Minus, Plus } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

type SubbingAssistantPanelProps = {
  teamFormat: TeamFormat
  halfLengthMinutes: number
  attendingCount: number
  gkPlaysFullHalf: boolean
  onGkPlaysFullHalfChange: (value: boolean) => void
  subFrequency: SubFrequency
  onSubFrequencyChange: (value: SubFrequency) => void
  /** Fires whenever the effective interval (suggestion ± override) changes. */
  onIntervalMinutesChange: (minutes: number | null) => void
  className?: string
}

/** Archived behind ENABLE_SUB_ASSISTANT — flip that flag to restore on Game Day setup. */
export function SubbingAssistantPanel({
  teamFormat,
  halfLengthMinutes,
  attendingCount,
  gkPlaysFullHalf,
  onGkPlaysFullHalfChange,
  subFrequency,
  onSubFrequencyChange,
  onIntervalMinutesChange,
  className,
}: SubbingAssistantPanelProps) {
  const [intervalOverrideMinutes, setIntervalOverrideMinutes] = useState<number | null>(null)

  // Drop manual override when format / attendance / frequency / half length change.
  const suggestionKey = `${teamFormat}|${halfLengthMinutes}|${attendingCount}|${gkPlaysFullHalf}|${subFrequency}`
  useEffect(() => {
    if (!ENABLE_SUB_ASSISTANT) return
    setIntervalOverrideMinutes(null)
  }, [suggestionKey])

  const plan = useMemo(
    () =>
      calculateSubRotationPlan({
        teamFormat,
        halfLengthMinutes,
        attendingCount,
        gkPlaysFullHalf,
        frequency: subFrequency,
        intervalOverrideMinutes,
      }),
    [
      teamFormat,
      halfLengthMinutes,
      attendingCount,
      gkPlaysFullHalf,
      subFrequency,
      intervalOverrideMinutes,
    ],
  )

  useEffect(() => {
    if (!ENABLE_SUB_ASSISTANT) {
      onIntervalMinutesChange(null)
      return
    }
    onIntervalMinutesChange(plan.ok && plan.playersToSwap > 0 ? plan.subIntervalMinutes : null)
  }, [plan.ok, plan.playersToSwap, plan.subIntervalMinutes, onIntervalMinutesChange])

  if (!ENABLE_SUB_ASSISTANT) return null

  const canStep = plan.ok && plan.playersToSwap > 0 && plan.subIntervalMinutes > 0
  const atMin = plan.subIntervalMinutes <= 1
  const atMax = plan.subIntervalMinutes >= halfLengthMinutes

  const stepInterval = (delta: number) => {
    if (!canStep) return
    const next = Math.max(1, Math.min(halfLengthMinutes, plan.subIntervalMinutes + delta))
    setIntervalOverrideMinutes(next)
  }

  return (
    <section
      aria-label="Sub rotation assistant"
      className={cn(
        'subbing-assistant-panel space-y-3 rounded-2xl border-2 border-border bg-card p-4',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-sm font-black uppercase tracking-wide text-foreground">
            Sub Rotation Assistant
          </h2>
          <p className="mt-1 text-xs font-semibold text-muted-foreground">
            Equal-play shifts from format, half length, attendance, and sub frequency.
          </p>
        </div>
        <label className="flex shrink-0 items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-foreground">
          <input
            type="checkbox"
            className="size-5 accent-athletic"
            checked={gkPlaysFullHalf}
            onChange={(event) => onGkPlaysFullHalfChange(event.target.checked)}
          />
          GK full half
        </label>
      </div>

      <div className="space-y-2">
        <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
          Sub Frequency
        </p>
        <div
          role="radiogroup"
          aria-label="Sub frequency"
          className="sub-frequency-toggle grid grid-cols-3 gap-2"
        >
          {SUB_FREQUENCY_OPTIONS.map((option) => {
            const selected = subFrequency === option.value
            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => onSubFrequencyChange(option.value)}
                className={cn(
                  'min-h-14 touch-manipulation rounded-xl border-2 px-2 py-2 text-center transition active:scale-[0.98]',
                  selected
                    ? 'border-neon bg-neon/15 text-foreground'
                    : 'border-border bg-background text-foreground',
                )}
              >
                <span className="block font-display text-sm font-black uppercase tracking-wide">
                  {option.label}
                </span>
                <span className="mt-0.5 block text-[10px] font-semibold leading-tight text-muted-foreground">
                  {option.hint}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      <SubRotationSummary
        plan={plan}
        attendingCount={attendingCount}
        teamFormat={teamFormat}
        canStep={canStep}
        atMin={atMin}
        atMax={atMax}
        onStep={stepInterval}
        overridden={intervalOverrideMinutes != null}
      />
    </section>
  )
}

function SubRotationSummary({
  plan,
  attendingCount,
  teamFormat,
  canStep,
  atMin,
  atMax,
  onStep,
  overridden,
}: {
  plan: SubRotationPlan
  attendingCount: number
  teamFormat: TeamFormat
  canStep: boolean
  atMin: boolean
  atMax: boolean
  onStep: (delta: number) => void
  overridden: boolean
}) {
  return (
    <div className="space-y-3 rounded-xl border-2 border-border bg-background px-3 py-3">
      <dl className="grid grid-cols-2 gap-2 text-xs font-bold uppercase tracking-wide text-muted-foreground sm:grid-cols-4">
        <div>
          <dt>Format</dt>
          <dd className="mt-0.5 font-display text-lg font-black tabular-nums text-foreground">
            {teamFormat}
          </dd>
        </div>
        <div>
          <dt>Attending</dt>
          <dd className="mt-0.5 font-display text-lg font-black tabular-nums text-foreground">
            {attendingCount}
          </dd>
        </div>
        <div>
          <dt>Field spots</dt>
          <dd className="mt-0.5 font-display text-lg font-black tabular-nums text-foreground">
            {plan.fieldPositions}
          </dd>
        </div>
        <div>
          <dt>Bench</dt>
          <dd className="mt-0.5 font-display text-lg font-black tabular-nums text-foreground">
            {plan.benchSize}
          </dd>
        </div>
      </dl>

      <div className="border-t-2 border-border pt-3">
        <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
          Sub interval {overridden ? '(adjusted)' : ''}
        </p>

        <div className="sub-interval-stepper mt-2 flex items-center gap-3">
          <button
            type="button"
            aria-label="Decrease interval by one minute"
            disabled={!canStep || atMin}
            onClick={() => onStep(-1)}
            className="inline-flex size-12 shrink-0 touch-manipulation items-center justify-center rounded-xl border-2 border-border bg-secondary text-foreground disabled:opacity-40 active:scale-95"
          >
            <Minus className="size-5" strokeWidth={2.5} />
          </button>

          <div className="min-w-0 flex-1 text-center">
            <p
              className={cn(
                'font-display text-4xl font-black tabular-nums tracking-tight',
                plan.ok && plan.playersToSwap > 0 ? 'text-foreground' : 'text-muted-foreground',
              )}
            >
              {plan.ok && plan.playersToSwap > 0 ? `${plan.subIntervalMinutes}` : '—'}
            </p>
            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
              minutes
            </p>
          </div>

          <button
            type="button"
            aria-label="Increase interval by one minute"
            disabled={!canStep || atMax}
            onClick={() => onStep(1)}
            className="inline-flex size-12 shrink-0 touch-manipulation items-center justify-center rounded-xl border-2 border-border bg-secondary text-foreground disabled:opacity-40 active:scale-95"
          >
            <Plus className="size-5" strokeWidth={2.5} />
          </button>
        </div>

        {plan.ok && plan.recommendation ? (
          <p className="mt-3 rounded-xl border-2 border-border bg-card px-3 py-2.5 text-sm font-bold leading-snug text-foreground">
            {plan.recommendation}
          </p>
        ) : null}

        {plan.ok ? (
          <p className="mt-2 text-xs font-semibold text-muted-foreground">
            ~{plan.targetMinutesPerPlayer.toFixed(1)} min on field · ~
            {Math.max(0, plan.totalRestNeeded).toFixed(1)} min rest per outfield player
            {plan.message ? ` · ${plan.message}` : ''}
            {plan.playersToSwap > 0
              ? ` · ~${plan.targetWindows} sub window${plan.targetWindows === 1 ? '' : 's'} this half`
              : ''}
          </p>
        ) : (
          <p className="mt-2 text-xs font-semibold text-muted-foreground">
            {plan.message ?? 'Adjust attendance to unlock a sub interval.'}
          </p>
        )}
      </div>
    </div>
  )
}
