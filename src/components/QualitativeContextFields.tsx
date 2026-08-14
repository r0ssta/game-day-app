import type { ReactNode } from 'react'
import {
  EMPTY_QUALITATIVE_CONTEXT,
  EXECUTION_SCORE_OPTIONS,
  OPPONENT_TIER_OPTIONS,
  formatQualitativeContextSummary,
  hasQualitativeContext,
  type ExecutionScore,
  type OpponentTier,
  type QualitativeContext,
} from '@/lib/qualitative-context'
import { cn } from '@/lib/utils'

type QualitativeContextFieldsProps = {
  value: QualitativeContext
  onChange: (value: QualitativeContext) => void
  readOnly?: boolean
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{children}</p>
  )
}

function tierChipClass(selected: boolean) {
  return cn(
    'flex min-h-[4.5rem] touch-manipulation flex-col items-start justify-center gap-0.5 rounded-xl border-2 px-3 py-2.5 text-left transition-transform active:scale-[0.98]',
    selected
      ? 'border-neon bg-neon/15 text-foreground ring-1 ring-neon/40'
      : 'border-border bg-card text-foreground',
  )
}

function scoreButtonClass(selected: boolean) {
  return cn(
    'flex min-h-12 flex-1 touch-manipulation flex-col items-center justify-center rounded-lg border-2 px-1 py-2 transition-transform active:scale-[0.97]',
    selected
      ? 'border-neon bg-neon text-neon-foreground ring-2 ring-neon/30'
      : 'border-border bg-card text-foreground',
  )
}

export function QualitativeContextFields({
  value,
  onChange,
  readOnly = false,
}: QualitativeContextFieldsProps) {
  const context = value ?? EMPTY_QUALITATIVE_CONTEXT

  if (readOnly) {
    const summaryLines = formatQualitativeContextSummary(context)
    return (
      <section className="space-y-3 rounded-xl border-2 border-border bg-card p-4">
        <div>
          <h2 className="font-display text-sm font-bold uppercase tracking-wide text-foreground">
            Qualitative Context
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">Recorded match context tags.</p>
        </div>
        {hasQualitativeContext(context) ? (
          <ul className="space-y-1.5 text-sm text-foreground">
            {summaryLines.slice(2).map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        ) : (
          <p className="text-sm italic text-muted-foreground">No qualitative context recorded.</p>
        )}
      </section>
    )
  }

  const patch = (partial: Partial<QualitativeContext>) => {
    onChange({ ...context, ...partial })
  }

  return (
    <section className="space-y-5 rounded-xl border-2 border-border bg-card p-4">
      <div>
        <h2 className="font-display text-sm font-bold uppercase tracking-wide text-foreground">
          Qualitative Context
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Optional quick-tap tags — skip anything you don&apos;t need. Finalize anytime.
        </p>
      </div>

      <div className="space-y-3">
        <div>
          <SectionLabel>Team Execution Score</SectionLabel>
          <p className="mt-1 text-xs text-muted-foreground">
            Optional 1–5 match performance scale — tap again to clear.
          </p>
        </div>

        <div
          className="grid grid-cols-5 gap-1.5 sm:gap-2"
          role="group"
          aria-label="Team execution score from 1 to 5"
        >
          {EXECUTION_SCORE_OPTIONS.slice()
            .reverse()
            .map((option) => (
              <button
                key={option.score}
                type="button"
                aria-pressed={context.executionScore === option.score}
                aria-label={`${option.score} - ${option.label}`}
                onClick={() =>
                  patch({
                    executionScore:
                      context.executionScore === option.score
                        ? null
                        : (option.score as ExecutionScore),
                  })
                }
                className={scoreButtonClass(context.executionScore === option.score)}
              >
                <span className="font-display text-xl font-black tabular-nums leading-none">
                  {option.score}
                </span>
              </button>
            ))}
        </div>

        {context.executionScore !== null ? (
          <div className="rounded-xl border-2 border-border bg-secondary/40 px-3 py-2.5">
            {(() => {
              const selected = EXECUTION_SCORE_OPTIONS.find(
                (option) => option.score === context.executionScore,
              )
              if (!selected) return null
              return (
                <>
                  <p className="text-sm font-bold text-foreground">
                    {selected.score} — {selected.label}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{selected.description}</p>
                </>
              )
            })()}
          </div>
        ) : (
          <div className="space-y-1.5">
            {EXECUTION_SCORE_OPTIONS.map((option) => (
              <p key={option.score} className="text-xs text-muted-foreground">
                <span className="font-bold tabular-nums text-foreground">{option.score}</span>
                {' — '}
                {option.label}: {option.description}
              </p>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-2">
        <SectionLabel>Opponent Tier &amp; Match Shape</SectionLabel>
        <p className="text-xs text-muted-foreground">
          Relative opponent level — tap again to clear.
        </p>
        <div
          className="grid gap-2"
          role="group"
          aria-label="Opponent tier and match shape"
        >
          {OPPONENT_TIER_OPTIONS.map((option) => {
            const selected = context.opponentTier === option.id
            return (
              <button
                key={option.id}
                type="button"
                aria-pressed={selected}
                aria-label={`${option.tierLabel}: ${option.title}, ${option.subtitle}`}
                onClick={() =>
                  patch({
                    opponentTier: selected ? null : (option.id as OpponentTier),
                  })
                }
                className={tierChipClass(selected)}
              >
                <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  {option.tierLabel}
                </span>
                <span className="text-sm font-bold leading-tight text-foreground">
                  {option.title}
                </span>
                <span className="text-xs font-medium text-muted-foreground">{option.subtitle}</span>
              </button>
            )
          })}
        </div>
      </div>
    </section>
  )
}
