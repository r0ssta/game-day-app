import type { ReactNode } from 'react'
import { Home } from 'lucide-react'
import { TOUCH_ICON_BUTTON } from '@/lib/layout'
import {
  AGE_GROUPS,
  type AgeGroup,
  ageGroupFormatHint,
  defaultTeamNameForAgeGroup,
  isAgeGroup,
} from '@/lib/age-groups'
import { CLUB_NAME } from '@/lib/branding'
import { useState } from 'react'

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

export type CreateTeamInput = {
  name?: string
  ageGroup: AgeGroup
}

type TeamSelectorProps = {
  teams: NamedEntity[]
  activeTeamId: string | null
  onTeamChange: (teamId: string) => void
  onAddTeam?: (input: CreateTeamInput) => Promise<string | void>
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
  onAddTeam: (input: CreateTeamInput) => Promise<string | void>
  onCreated: (teamId: string) => void
}) {
  const [ageGroup, setAgeGroup] = useState<AgeGroup>('U13')
  const [name, setName] = useState('')

  return (
    <form
      className="mt-3 space-y-2"
      onSubmit={(e) => {
        e.preventDefault()
        void onAddTeam({
          name: name.trim() || undefined,
          ageGroup,
        }).then((id) => {
          if (id) onCreated(id)
          setName('')
        })
      }}
    >
      <select
        value={ageGroup}
        onChange={(event) => {
          if (isAgeGroup(event.target.value)) setAgeGroup(event.target.value)
        }}
        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-bold text-foreground"
        aria-label="Age group"
      >
        {AGE_GROUPS.map((group) => (
          <option key={group} value={group}>
            {ageGroupFormatHint(group)}
          </option>
        ))}
      </select>
      <div className="flex gap-2">
        <input
          name="team-name"
          type="text"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder={`Name (default ${defaultTeamNameForAgeGroup(ageGroup, CLUB_NAME)})`}
          className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm font-semibold"
        />
        <button
          type="submit"
          className="shrink-0 rounded-lg bg-athletic px-3 py-2 text-xs font-bold uppercase text-athletic-foreground"
        >
          Add
        </button>
      </div>
    </form>
  )
}
