import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { UserPlus, X } from 'lucide-react'
import { formatPlayerFullName } from '@/lib/player-names'
import {
  DEFAULT_PRIMARY_POSITION,
  DEFAULT_SECONDARY_POSITION,
  RosterPositionFields,
} from '@/components/RosterPositionFields'
import type { RosterProfilePosition } from '@/lib/positions'
import { cn } from '@/lib/utils'

export type AddPlayerToRosterProps = {
  selectedTeamId: string | null
  ageGroup: import('@/lib/age-groups').AgeGroup
  excludePlayerIds: string[]
  loadAgeGroupPool: (
    ageGroup: import('@/lib/age-groups').AgeGroup,
  ) => Promise<import('@/types/database').DbPlayer[]>
  onAddFromPool: (playerId: string) => Promise<void>
  suggestedJersey: number
  onAdd: (input: {
    firstName: string
    lastName: string
    jersey: number | null
    isGuest: boolean
    primaryPosition?: string
    secondaryPosition?: string
  }) => Promise<void>
}

export function AddPlayerToRoster({
  selectedTeamId,
  ageGroup,
  excludePlayerIds,
  loadAgeGroupPool,
  onAddFromPool,
  suggestedJersey,
  onAdd,
}: AddPlayerToRosterProps) {
  const [expanded, setExpanded] = useState(false)
  const [mode, setMode] = useState<'pool' | 'create'>('pool')
  const [pool, setPool] = useState<import('@/types/database').DbPlayer[]>([])
  const [poolLoading, setPoolLoading] = useState(false)
  const [selectedPoolPlayerId, setSelectedPoolPlayerId] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [number, setNumber] = useState('')
  const [isGuest, setIsGuest] = useState(false)
  const [primaryPosition, setPrimaryPosition] = useState<RosterProfilePosition>(DEFAULT_PRIMARY_POSITION)
  const [secondaryPosition, setSecondaryPosition] =
    useState<RosterProfilePosition>(DEFAULT_SECONDARY_POSITION)
  const [saving, setSaving] = useState(false)

  const teamSelected = Boolean(selectedTeamId)
  const excluded = useMemo(() => new Set(excludePlayerIds), [excludePlayerIds])
  const availablePool = useMemo(
    () => pool.filter((player) => !excluded.has(player.id)),
    [pool, excluded],
  )
  const canAddFromPool = teamSelected && selectedPoolPlayerId !== '' && !saving
  const canSubmitCreate =
    teamSelected && firstName.trim().length > 0 && lastName.trim().length > 0 && !saving

  useEffect(() => {
    if (!expanded || !teamSelected) return
    let cancelled = false
    setPoolLoading(true)
    void loadAgeGroupPool(ageGroup)
      .then((rows) => {
        if (!cancelled) setPool(rows)
      })
      .catch(() => {
        if (!cancelled) setPool([])
      })
      .finally(() => {
        if (!cancelled) setPoolLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [expanded, teamSelected, ageGroup, loadAgeGroupPool])

  const resetForm = () => {
    setSelectedPoolPlayerId('')
    setFirstName('')
    setLastName('')
    setIsGuest(false)
    setNumber('')
    setPrimaryPosition(DEFAULT_PRIMARY_POSITION)
    setSecondaryPosition(DEFAULT_SECONDARY_POSITION)
    setMode('pool')
  }

  const handleAddFromPool = async (e: FormEvent) => {
    e.preventDefault()
    if (!canAddFromPool) return
    setSaving(true)
    try {
      await onAddFromPool(selectedPoolPlayerId)
      resetForm()
      setExpanded(false)
    } finally {
      setSaving(false)
    }
  }

  const handleSubmitCreate = async (e: FormEvent) => {
    e.preventDefault()
    if (!canSubmitCreate || !selectedTeamId) return

    const trimmedFirst = firstName.trim()
    const trimmedLast = lastName.trim()
    const jerseyRaw = number.trim()
    let jersey: number | null = null
    if (jerseyRaw !== '') {
      const parsed = Number(jerseyRaw)
      if (Number.isNaN(parsed)) return
      jersey = parsed
    }

    setSaving(true)
    try {
      await onAdd({
        firstName: trimmedFirst,
        lastName: trimmedLast,
        jersey,
        isGuest,
        primaryPosition,
        secondaryPosition,
      })
      resetForm()
      setExpanded(false)
    } finally {
      setSaving(false)
    }
  }

  if (!expanded) {
    return (
      <button
        type="button"
        disabled={!teamSelected}
        onClick={() => setExpanded(true)}
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-athletic/50 bg-athletic/5 py-3.5 text-sm font-bold uppercase tracking-wide text-athletic transition-colors active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
      >
        <UserPlus className="size-4" strokeWidth={2.5} />
        + Add Player
      </button>
    )
  }

  return (
    <section
      aria-label="Add player to roster"
      className="mt-3 rounded-xl border border-athletic/40 bg-card p-4"
    >
      <div className="mb-3 flex items-center justify-between">
        <h3 className="flex items-center gap-2 font-display text-sm font-bold uppercase tracking-wide text-foreground">
          <UserPlus className="size-4 text-athletic" />
          Add Player
        </h3>
        <button
          type="button"
          onClick={() => {
            resetForm()
            setExpanded(false)
          }}
          aria-label="Close add player form"
          className="flex size-8 items-center justify-center rounded-lg bg-secondary text-foreground active:scale-90"
        >
          <X className="size-4" strokeWidth={2.5} />
        </button>
      </div>

      {!teamSelected && (
        <p className="mb-3 text-sm text-muted-foreground">Select a team above to add players.</p>
      )}

      <div className="mb-3 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setMode('pool')}
          className={cn(
            'rounded-lg border-2 px-3 py-2 text-xs font-bold uppercase tracking-wide',
            mode === 'pool'
              ? 'border-athletic bg-athletic/15 text-foreground'
              : 'border-border bg-background text-muted-foreground',
          )}
        >
          From {ageGroup} Pool
        </button>
        <button
          type="button"
          onClick={() => setMode('create')}
          className={cn(
            'rounded-lg border-2 px-3 py-2 text-xs font-bold uppercase tracking-wide',
            mode === 'create'
              ? 'border-athletic bg-athletic/15 text-foreground'
              : 'border-border bg-background text-muted-foreground',
          )}
        >
          Create New
        </button>
      </div>

      {mode === 'pool' ? (
        <form onSubmit={(e) => void handleAddFromPool(e)} className="space-y-3">
          <div>
            <label
              htmlFor="setup-pool-player"
              className="mb-1.5 block text-xs font-bold uppercase tracking-widest text-muted-foreground"
            >
              Existing {ageGroup} player
            </label>
            <select
              id="setup-pool-player"
              value={selectedPoolPlayerId}
              onChange={(e) => setSelectedPoolPlayerId(e.target.value)}
              disabled={!teamSelected || poolLoading || saving}
              className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-base font-semibold text-foreground focus:border-neon focus:outline-none focus:ring-2 focus:ring-neon/30 disabled:opacity-40"
            >
              <option value="">
                {poolLoading
                  ? 'Loading pool…'
                  : availablePool.length === 0
                    ? `No available ${ageGroup} players`
                    : 'Select a player…'}
              </option>
              {availablePool.map((player) => (
                <option key={player.id} value={player.id}>
                  {player.jersey != null ? `#${player.jersey} ` : ''}
                  {formatPlayerFullName(player.first_name, player.last_name)}
                </option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            disabled={!canAddFromPool}
            className="w-full rounded-lg bg-athletic py-3 text-sm font-bold uppercase tracking-wide text-athletic-foreground active:scale-[0.98] disabled:opacity-40"
          >
            {saving ? 'Adding…' : 'Add From Pool'}
          </button>
        </form>
      ) : (
        <form onSubmit={(e) => void handleSubmitCreate(e)} className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label
                htmlFor="new-player-first-name"
                className="mb-1.5 block text-xs font-bold uppercase tracking-widest text-muted-foreground"
              >
                First Name
              </label>
              <input
                id="new-player-first-name"
                type="text"
                required
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="First name"
                className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-base font-semibold text-foreground placeholder:text-muted-foreground focus:border-neon focus:outline-none focus:ring-2 focus:ring-neon/30"
              />
            </div>
            <div>
              <label
                htmlFor="new-player-last-name"
                className="mb-1.5 block text-xs font-bold uppercase tracking-widest text-muted-foreground"
              >
                Last Name
              </label>
              <input
                id="new-player-last-name"
                type="text"
                required
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Last name"
                className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-base font-semibold text-foreground placeholder:text-muted-foreground focus:border-neon focus:outline-none focus:ring-2 focus:ring-neon/30"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="new-player-jersey"
              className="mb-1.5 block text-xs font-bold uppercase tracking-widest text-muted-foreground"
            >
              Jersey Number
            </label>
            <input
              id="new-player-jersey"
              type="number"
              min={0}
              max={99}
              value={number}
              onChange={(e) => setNumber(e.target.value)}
              placeholder={suggestedJersey ? `Optional · e.g. ${suggestedJersey}` : 'Optional'}
              className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-base font-semibold tabular-nums text-foreground placeholder:text-muted-foreground focus:border-neon focus:outline-none focus:ring-2 focus:ring-neon/30"
            />
          </div>

          <RosterPositionFields
            idPrefix="setup-add-player"
            primaryPosition={primaryPosition}
            secondaryPosition={secondaryPosition}
            onPrimaryChange={setPrimaryPosition}
            onSecondaryChange={setSecondaryPosition}
          />

          <div className="flex items-center justify-between rounded-lg border border-border bg-background px-3 py-2.5">
            <label htmlFor="new-player-guest" className="text-sm font-bold text-foreground">
              Is Guest Player?
            </label>
            <button
              id="new-player-guest"
              type="button"
              role="switch"
              aria-checked={isGuest}
              onClick={() => setIsGuest((v) => !v)}
              className={cn(
                'relative h-7 w-12 rounded-full transition-colors',
                isGuest ? 'bg-athletic' : 'bg-secondary',
              )}
            >
              <span
                className={cn(
                  'absolute top-0.5 size-6 rounded-full bg-white shadow transition-transform',
                  isGuest ? 'left-5' : 'left-0.5',
                )}
              />
            </button>
          </div>

          <button
            type="submit"
            disabled={!canSubmitCreate}
            className="w-full rounded-lg bg-athletic py-3 text-sm font-bold uppercase tracking-wide text-athletic-foreground active:scale-[0.98] disabled:opacity-40"
          >
            {saving ? 'Adding…' : 'Add Player'}
          </button>
        </form>
      )}
    </section>
  )
}
