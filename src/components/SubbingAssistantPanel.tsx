import { calculateSubRotationPlan, type SubRotationPlan } from '@/lib/sub-rotation'
import type { TeamFormat } from '@/lib/team-format'
import { cn } from '@/lib/utils'
import { useMemo } from 'react'

type SubbingAssistantPanelProps = {
  teamFormat: TeamFormat
  halfLengthMinutes: number
  attendingCount: number
  gkPlaysFullHalf: boolean
  onGkPlaysFullHalfChange: (value: boolean) => void
  className?: string
}

export function SubbingAssistantPanel({
  teamFormat,
  halfLengthMinutes,
  attendingCount,
  gkPlaysFullHalf,
  onGkPlaysFullHalfChange,
  className,
}: SubbingAssistantPanelProps) {
  const plan = useMemo(
    () =>
      calculateSubRotationPlan({
        teamFormat,
        halfLengthMinutes,
        attendingCount,
        gkPlaysFullHalf,
      }),
    [teamFormat, halfLengthMinutes, attendingCount, gkPlaysFullHalf],
  )

  return (
    <section
      aria-label="Subbing assistant"
      className={cn(
        'subbing-assistant-panel space-y-3 rounded-2xl border-2 border-border bg-card p-4',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-sm font-black uppercase tracking-wide text-foreground">
            Subbing Assistant
          </h2>
          <p className="mt-1 text-xs font-semibold text-muted-foreground">
            Equal-play interval from {teamFormat}, half length, and attending count.
          </p>
        </div>
        <label className="flex shrink-0 items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-foreground">
          <input
            type="checkbox"
            className="size-4 accent-athletic"
            checked={gkPlaysFullHalf}
            onChange={(event) => onGkPlaysFullHalfChange(event.target.checked)}
          />
          GK full half
        </label>
      </div>

      <SubRotationSummary
        plan={plan}
        attendingCount={attendingCount}
        teamFormat={teamFormat}
      />
    </section>
  )
}

function SubRotationSummary({
  plan,
  attendingCount,
  teamFormat,
}: {
  plan: SubRotationPlan
  attendingCount: number
  teamFormat: TeamFormat
}) {
  return (
    <div className="space-y-2 rounded-xl border-2 border-border bg-background px-3 py-3">
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
          <dt>Outfield pool</dt>
          <dd className="mt-0.5 font-display text-lg font-black tabular-nums text-foreground">
            {plan.availableFieldPlayers}
          </dd>
        </div>
      </dl>

      <div className="border-t-2 border-border pt-2">
        <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
          Suggested sub interval
        </p>
        <p
          className={cn(
            'font-display text-3xl font-black tabular-nums tracking-tight',
            plan.ok ? 'text-foreground' : 'text-muted-foreground',
          )}
        >
          {plan.ok ? `${plan.subIntervalMinutes} min` : '—'}
        </p>
        {plan.ok ? (
          <p className="mt-1 text-xs font-semibold text-muted-foreground">
            ~{plan.targetMinutesPerPlayer.toFixed(1)} target minutes per outfield player this half
            {plan.message ? ` · ${plan.message}` : ''}
          </p>
        ) : (
          <p className="mt-1 text-xs font-semibold text-muted-foreground">
            {plan.message ?? 'Adjust attendance to unlock a sub interval.'}
          </p>
        )}
      </div>
    </div>
  )
}
