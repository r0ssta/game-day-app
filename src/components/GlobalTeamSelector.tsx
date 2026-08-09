import { useId } from 'react'
import { ChevronDown, Users } from 'lucide-react'
import { cn } from '@/lib/utils'

type TeamOption = {
  id: string
  name: string
}

type GlobalTeamSelectorProps = {
  teams: TeamOption[]
  activeTeamId: string | null
  onTeamChange: (teamId: string) => void
  disabled?: boolean
  disabledReason?: string
  /** Compact header control vs. full-width screen control. */
  variant?: 'header' | 'panel'
  className?: string
}

export function GlobalTeamSelector({
  teams,
  activeTeamId,
  onTeamChange,
  disabled = false,
  disabledReason,
  variant = 'header',
  className,
}: GlobalTeamSelectorProps) {
  const reactId = useId()
  const isDisabled = disabled || teams.length === 0
  const selectId = `global-team-select-${variant}-${reactId}`
  const disabledReasonId = `${selectId}-disabled-reason`

  return (
    <div className={cn('min-w-0', variant === 'header' ? 'flex-1' : 'w-full', className)}>
      {variant === 'panel' ? (
        <label
          htmlFor={selectId}
          className="mb-1.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-muted-foreground"
        >
          <Users className="size-3.5" strokeWidth={2.5} />
          Active Team
        </label>
      ) : (
        <label htmlFor={selectId} className="sr-only">
          Active team
        </label>
      )}

      <div className="relative">
        <select
          id={selectId}
          data-global-team-select={variant}
          value={activeTeamId ?? ''}
          disabled={isDisabled}
          title={isDisabled && disabledReason ? disabledReason : undefined}
          aria-describedby={
            isDisabled && disabledReason ? disabledReasonId : undefined
          }
          onChange={(event) => {
            const value = event.target.value
            if (value) onTeamChange(value)
          }}
          className={cn(
            'w-full touch-manipulation appearance-none truncate rounded-xl border-2 border-border bg-card font-bold text-foreground shadow-sm',
            'focus-visible:border-neon focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neon/40',
            'disabled:cursor-not-allowed disabled:opacity-60',
            variant === 'header'
              ? 'min-h-11 px-3 py-2 pr-9 text-sm'
              : 'min-h-12 px-4 py-3 pr-11 text-base',
          )}
        >
          {teams.length === 0 ? (
            <option value="">No teams yet</option>
          ) : !activeTeamId ? (
            <option value="" disabled>
              Select a team…
            </option>
          ) : null}
          {teams.map((team) => (
            <option key={team.id} value={team.id}>
              {team.name}
            </option>
          ))}
        </select>
        <ChevronDown
          aria-hidden
          className={cn(
            'pointer-events-none absolute top-1/2 -translate-y-1/2 text-foreground',
            variant === 'header' ? 'right-2.5 size-4' : 'right-3.5 size-5',
            isDisabled && 'opacity-50',
          )}
          strokeWidth={2.5}
        />
      </div>
      {isDisabled && disabledReason ? (
        <p
          id={disabledReasonId}
          className={cn(
            'font-semibold text-muted-foreground',
            variant === 'header' ? 'sr-only' : 'mt-1.5 text-xs',
          )}
        >
          {disabledReason}
        </p>
      ) : null}
    </div>
  )
}
