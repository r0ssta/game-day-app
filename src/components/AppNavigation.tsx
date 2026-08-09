import type { ReactNode } from 'react'
import { Home } from 'lucide-react'
import { ADD_NEW_OPTION } from '@/lib/named-entities'
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
  onAddTeam?: (name: string) => Promise<string | void>
  prominent?: boolean
}

export function TeamSelector({
  teams,
  activeTeamId,
  onTeamChange,
  onAddTeam,
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
        data-global-team-select="home"
        value={activeTeamId ?? ''}
        onChange={(e) => {
          const value = e.target.value
          if (value === ADD_NEW_OPTION) return
          if (value) onTeamChange(value)
        }}
        className="w-full min-h-12 touch-manipulation rounded-xl border-2 border-border bg-background px-4 py-3.5 text-lg font-bold text-foreground focus:border-neon focus:outline-none focus:ring-2 focus:ring-neon/30"
      >
        {teams.length === 0 ? (
          <option value="">No teams yet — add one below</option>
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
      {onAddTeam && (
        <AddTeamInline onAddTeam={onAddTeam} onCreated={onTeamChange} />
      )}
    </div>
  )
}

function AddTeamInline({
  onAddTeam,
  onCreated,
}: {
  onAddTeam: (name: string) => Promise<string | void>
  onCreated: (teamId: string) => void
}) {
  return (
    <form
      className="mt-3 flex gap-2"
      onSubmit={(e) => {
        e.preventDefault()
        const form = e.currentTarget
        const input = form.elements.namedItem('team-name') as HTMLInputElement
        const trimmed = input.value.trim()
        if (!trimmed) return
        void onAddTeam(trimmed).then((id) => {
          if (id) onCreated(id)
          input.value = ''
        })
      }}
    >
      <input
        name="team-name"
        type="text"
        placeholder="New team name"
        className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm font-semibold"
      />
      <button
        type="submit"
        className="shrink-0 rounded-lg bg-athletic px-3 py-2 text-xs font-bold uppercase text-athletic-foreground"
      >
        Add
      </button>
    </form>
  )
}
