import { useCallback, useEffect, useMemo, useState } from 'react'
import { Archive, Users } from 'lucide-react'
import { SprocketRosterCsvImport } from '@/components/SprocketRosterCsvImport'
import {
  AGE_GROUPS,
  type AgeGroup,
  formatTeamDisplayName,
  isAgeGroup,
} from '@/lib/age-groups'
import { formatPlayerFullName } from '@/lib/player-names'
import type { DbPlayer } from '@/types/database'
import { cn } from '@/lib/utils'

type AgeGroupPoolPanelProps = {
  teams: Array<{ id: string; name: string; ageGroup?: string | null; activeStatus?: boolean }>
  seasonId: string | null
  loadPool: (
    ageGroup: AgeGroup,
    options?: { includeInactive?: boolean },
  ) => Promise<DbPlayer[]>
  onAssignToTeam: (input: {
    seasonId: string
    teamId: string
    playerId: string
    primaryJerseyNumber?: number | null
  }) => Promise<unknown>
  onCreatePoolPlayer: (input: {
    firstName: string
    lastName: string
    jersey: number | null
    ageGroup: AgeGroup
    primaryPosition?: string
    secondaryPosition?: string
  }) => Promise<unknown>
  onSetPlayerActive: (playerId: string, active: boolean) => Promise<unknown>
  onToast: (message: string) => void
}

export function AgeGroupPoolPanel({
  teams,
  seasonId,
  loadPool,
  onAssignToTeam,
  onCreatePoolPlayer,
  onSetPlayerActive,
  onToast,
}: AgeGroupPoolPanelProps) {
  const [ageGroup, setAgeGroup] = useState<AgeGroup>('U13')
  const [pool, setPool] = useState<DbPlayer[]>([])
  const [loading, setLoading] = useState(false)
  const [showArchived, setShowArchived] = useState(false)
  const activeTeams = useMemo(
    () => teams.filter((team) => team.activeStatus !== false),
    [teams],
  )
  const [assignTeamId, setAssignTeamId] = useState(activeTeams[0]?.id ?? '')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [jersey, setJersey] = useState('')
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      setPool(await loadPool(ageGroup, { includeInactive: showArchived }))
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Failed to load pool')
    } finally {
      setLoading(false)
    }
  }, [ageGroup, loadPool, onToast, showArchived])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const matchingTeams = activeTeams.filter(
    (team) => !team.ageGroup || team.ageGroup === ageGroup,
  )
  const visiblePool = showArchived ? pool : pool.filter((player) => player.active_status)

  return (
    <section className="age-group-pool-panel mt-6 space-y-4 rounded-2xl border-2 border-border bg-card p-4">
      <div className="flex items-center gap-2">
        <Users className="size-5 text-athletic" strokeWidth={2.5} />
        <h2 className="font-display text-sm font-bold uppercase tracking-wide text-foreground">
          Age-Group Player Pool
        </h2>
      </div>
      <p className="text-xs font-semibold text-muted-foreground">
        Club players live in an age-group pool. Archive players who leave so they stay out of
        selectors while match history and stats remain.
      </p>

      <label className="block space-y-1.5">
        <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
          Age group
        </span>
        <select
          value={ageGroup}
          onChange={(event) => {
            if (isAgeGroup(event.target.value)) setAgeGroup(event.target.value)
          }}
          className="min-h-12 w-full touch-manipulation rounded-xl border-2 border-border bg-background px-3 text-sm font-bold text-foreground"
        >
          {AGE_GROUPS.map((group) => (
            <option key={group} value={group}>
              {group}
            </option>
          ))}
        </select>
      </label>

      <form
        className="grid gap-2 sm:grid-cols-4"
        onSubmit={(event) => {
          event.preventDefault()
          if (!firstName.trim()) {
            onToast('First name is required')
            return
          }
          setBusy(true)
          void onCreatePoolPlayer({
            firstName: firstName.trim(),
            lastName: lastName.trim(),
            jersey: jersey.trim() ? Number(jersey) : null,
            ageGroup,
          })
            .then(() => {
              setFirstName('')
              setLastName('')
              setJersey('')
              onToast('Pool player created')
              return refresh()
            })
            .catch((err) => onToast(err instanceof Error ? err.message : 'Failed to create player'))
            .finally(() => setBusy(false))
        }}
      >
        <input
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
          placeholder="First"
          className="min-h-11 rounded-xl border-2 border-border bg-background px-3 text-sm font-semibold"
        />
        <input
          value={lastName}
          onChange={(e) => setLastName(e.target.value)}
          placeholder="Last"
          className="min-h-11 rounded-xl border-2 border-border bg-background px-3 text-sm font-semibold"
        />
        <input
          value={jersey}
          onChange={(e) => setJersey(e.target.value)}
          placeholder="#"
          inputMode="numeric"
          className="min-h-11 rounded-xl border-2 border-border bg-background px-3 text-sm font-semibold"
        />
        <button
          type="submit"
          disabled={busy}
          className="min-h-11 rounded-xl border-2 border-neon bg-neon px-3 text-xs font-bold uppercase tracking-wide text-neon-foreground disabled:opacity-50"
        >
          Add to Pool
        </button>
      </form>

      <SprocketRosterCsvImport
        enabled
        contextLabel={`the ${ageGroup} pool`}
        onAddPlayer={async (input) => {
          await onCreatePoolPlayer({
            firstName: input.firstName,
            lastName: input.lastName,
            jersey: input.jersey,
            ageGroup,
            primaryPosition: input.primaryPosition,
            secondaryPosition: input.secondaryPosition,
          })
        }}
        onToast={(message) => {
          onToast(message)
          void refresh()
        }}
      />

      <label className="block space-y-1.5">
        <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
          Assign selected players to team (active season)
        </span>
        <select
          value={assignTeamId}
          onChange={(e) => setAssignTeamId(e.target.value)}
          className="min-h-11 w-full rounded-xl border-2 border-border bg-background px-3 text-sm font-bold"
        >
          <option value="">Select team</option>
          {(matchingTeams.length > 0 ? matchingTeams : activeTeams).map((team) => (
            <option key={team.id} value={team.id}>
              {formatTeamDisplayName(team.name, team.ageGroup)}
            </option>
          ))}
        </select>
      </label>

      <label className="flex items-center gap-2 text-xs font-bold text-muted-foreground">
        <input
          type="checkbox"
          className="size-4 accent-athletic"
          checked={showArchived}
          onChange={(e) => setShowArchived(e.target.checked)}
        />
        Show archived players
      </label>

      <ul className="max-h-64 space-y-2 overflow-y-auto">
        {loading ? (
          <li className="text-sm font-semibold text-muted-foreground">Loading…</li>
        ) : visiblePool.length === 0 ? (
          <li className="text-sm font-semibold text-muted-foreground">No players in this pool yet.</li>
        ) : (
          visiblePool.map((player) => {
            const archived = !player.active_status
            return (
              <li
                key={player.id}
                className={cn(
                  'flex items-center gap-2 rounded-xl border-2 px-3 py-2',
                  archived
                    ? 'border-dashed border-border bg-background/60 opacity-80'
                    : 'border-border bg-background',
                )}
              >
                <span className="w-8 text-center font-display text-sm font-black tabular-nums">
                  {player.jersey ?? '—'}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-bold">
                  {formatPlayerFullName(player.first_name, player.last_name)}
                  {archived ? ' (archived)' : ''}
                </span>
                {!archived ? (
                  <button
                    type="button"
                    disabled={!seasonId || !assignTeamId || busy}
                    onClick={() => {
                      if (!seasonId || !assignTeamId) return
                      setBusy(true)
                      void onAssignToTeam({
                        seasonId,
                        teamId: assignTeamId,
                        playerId: player.id,
                        primaryJerseyNumber: player.jersey,
                      })
                        .then(() => onToast('Assigned to season roster'))
                        .catch((err) =>
                          onToast(err instanceof Error ? err.message : 'Failed to assign'),
                        )
                        .finally(() => setBusy(false))
                    }}
                    className="min-h-10 shrink-0 rounded-lg border-2 border-border bg-card px-2 text-[11px] font-bold uppercase tracking-wide disabled:opacity-40"
                  >
                    Assign
                  </button>
                ) : null}
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setBusy(true)
                    void onSetPlayerActive(player.id, archived)
                      .then(() => {
                        onToast(archived ? 'Player restored' : 'Player archived')
                        return refresh()
                      })
                      .catch((err) =>
                        onToast(err instanceof Error ? err.message : 'Failed to update player'),
                      )
                      .finally(() => setBusy(false))
                  }}
                  className="flex size-10 shrink-0 items-center justify-center rounded-lg border-2 border-border bg-card text-foreground disabled:opacity-40"
                  aria-label={archived ? 'Restore player' : 'Archive player'}
                >
                  <Archive className="size-4" strokeWidth={2.5} />
                </button>
              </li>
            )
          })
        )}
      </ul>
    </section>
  )
}
