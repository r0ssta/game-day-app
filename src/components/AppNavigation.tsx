import type { ReactNode } from 'react'
import { Home } from 'lucide-react'
import { TOUCH_ICON_BUTTON } from '@/lib/layout'

type NamedEntity = { id: string; name: string }

export function BackToHomeButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Back to home"
      className={`${TOUCH_ICON_BUTTON} shrink-0 gap-1.5 bg-secondary px-4 text-xs font-bold uppercase tracking-wide text-foreground`}
    >
      <Home className="size-4" />
      Home
    </button>
  )
}

export function ScreenHeader({
  title,
  subtitle,
  onHome,
  teamSwitcher,
}: {
  title: string
  subtitle?: string
  onHome: () => void
  /** Optional active-team control shown under the title (Roster, Analytics, etc.). */
  teamSwitcher?: ReactNode
}) {
  return (
    <header className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-3xl font-bold uppercase tracking-wide text-foreground">
            {title}
          </h1>
          {subtitle ? <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p> : null}
        </div>
        <BackToHomeButton onClick={onHome} />
      </div>
      {teamSwitcher ? (
        <div className="rounded-xl border-2 border-border bg-card p-3 shadow-sm">{teamSwitcher}</div>
      ) : null}
    </header>
  )
}

type TeamSelectorProps = {
  teams: NamedEntity[]
  activeTeamId: string | null
  onTeamChange: (teamId: string) => void
  prominent?: boolean
}

export function TeamSelector({
  teams,
  activeTeamId,
  onTeamChange,
  prominent = false,
}: TeamSelectorProps) {
  return (
    <div
      className={
        prominent
          ? 'rounded-2xl border border-neon/30 bg-card p-4 shadow-sm'
          : undefined
      }
    >
      <label
        htmlFor="active-team-select"
        className="mb-2 block text-xs font-bold uppercase tracking-widest text-muted-foreground"
      >
        Active Team
      </label>
      <select
        id="active-team-select"
        value={activeTeamId ?? ''}
        onChange={(e) => {
          const value = e.target.value
          if (!value) return
          onTeamChange(value)
        }}
        className="w-full rounded-xl border-2 border-border bg-background px-3 py-3 text-sm font-bold text-foreground"
      >
        <option value="" disabled>
          Select a team
        </option>
        {teams.map((team) => (
          <option key={team.id} value={team.id}>
            {team.name}
          </option>
        ))}
      </select>
    </div>
  )
}
