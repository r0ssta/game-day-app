import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import {
  ArrowLeft,
  History,
  LayoutGrid,
  Pencil,
  Save,
  Trash2,
  UserMinus,
  UserPlus,
  Users,
} from 'lucide-react'
import { MatchRecapDetailView } from '@/components/MatchRecapDetailView'
import {
  DEFAULT_PRIMARY_POSITION,
  DEFAULT_SECONDARY_POSITION,
  RosterPositionFields,
} from '@/components/RosterPositionFields'
import { TacticalPitchLineup } from '@/components/TacticalPitchLineup'
import { formatMatchDisplayDateTime } from '@/lib/match-schedule'
import { parseFormationJson } from '@/lib/lineup-presets'
import { MAX_FIELD_PLAYERS } from '@/lib/lineup'
import { fetchCompletedMatchesByTeamId } from '@/lib/supabase-api'
import { cn } from '@/lib/utils'
import type { DbLineupPreset, DbMatch } from '@/types/database'
import type { RosterProfilePosition } from '@/lib/positions'

import type { RosterPlayer } from '@/types/match'

type NamedEntity = { id: string; name: string }
type TeamTab = 'roster' | 'lineups' | 'history'

function formatJersey(number: number | null) {
  return number !== null ? String(number) : '—'
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex-1 rounded-lg px-2 py-2.5 text-xs font-bold uppercase tracking-wide transition-colors active:scale-[0.98]',
        active ? 'bg-neon text-neon-foreground' : 'bg-secondary text-muted-foreground',
      )}
    >
      {children}
    </button>
  )
}

type TeamManagementScreenProps = {
  teams: NamedEntity[]
  selectedTeamId: string | null
  onTeamChange: (id: string) => void
  rosterLoading: boolean
  teamRoster: RosterPlayer[]
  suggestedJersey: number
  lineupPresets: DbLineupPreset[]
  onRefreshPresets: () => Promise<void>
  onRefreshRoster: () => Promise<void>
  onAddPlayer: (input: {
    name: string
    jersey: number | null
    isGuest: boolean
    primaryPosition?: string
    secondaryPosition?: string
    contactInfo?: string
  }) => Promise<unknown>
  onUpdatePlayer: (
    id: string,
    updates: {
      name: string
      jersey: number | null
      isGuest: boolean
      primaryPosition?: string
      secondaryPosition?: string
      contactInfo?: string
    },
  ) => Promise<unknown>
  onSetPlayerActive: (id: string, active: boolean) => Promise<void>
  onSavePreset: (input: {
    presetId?: string
    presetName: string
    formationId: string
    slotAssignments: Record<string, string | null>
  }) => Promise<void>
  onDeletePreset: (presetId: string) => Promise<void>
  onBack: () => void
  onToast: (message: string) => void
}

function TeamRosterTab({
  rosterLoading,
  teamRoster,
  suggestedJersey,
  onAddPlayer,
  onUpdatePlayer,
  onSetPlayerActive,
  onToast,
}: Pick<
  TeamManagementScreenProps,
  | 'rosterLoading'
  | 'teamRoster'
  | 'suggestedJersey'
  | 'onAddPlayer'
  | 'onUpdatePlayer'
  | 'onSetPlayerActive'
  | 'onToast'
>) {
  const [showAddForm, setShowAddForm] = useState(false)
  const [name, setName] = useState('')
  const [number, setNumber] = useState('')
  const [contactInfo, setContactInfo] = useState('')
  const [primaryPosition, setPrimaryPosition] = useState<RosterProfilePosition>(DEFAULT_PRIMARY_POSITION)
  const [secondaryPosition, setSecondaryPosition] =
    useState<RosterProfilePosition>(DEFAULT_SECONDARY_POSITION)
  const [isGuest, setIsGuest] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState({
    name: '',
    number: '',
    contactInfo: '',
    isGuest: false,
    primaryPosition: DEFAULT_PRIMARY_POSITION as RosterProfilePosition,
    secondaryPosition: DEFAULT_SECONDARY_POSITION as RosterProfilePosition,
  })

  const activePlayers = teamRoster.filter((p) => p.activeStatus)
  const inactivePlayers = teamRoster.filter((p) => !p.activeStatus)

  const resetAddForm = () => {
    setName('')
    setNumber('')
    setContactInfo('')
    setPrimaryPosition(DEFAULT_PRIMARY_POSITION)
    setSecondaryPosition(DEFAULT_SECONDARY_POSITION)
    setIsGuest(false)
    setShowAddForm(false)
  }

  const handleAdd = async (e: FormEvent) => {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    let jersey: number | null = null
    if (number.trim()) {
      const parsed = Number(number.trim())
      if (Number.isNaN(parsed)) return
      jersey = parsed
    }
    setSaving(true)
    try {
      await onAddPlayer({
        name: trimmed,
        jersey,
        isGuest,
        primaryPosition,
        secondaryPosition,
        contactInfo: contactInfo.trim(),
      })
      onToast(`Added ${trimmed}`)
      resetAddForm()
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Failed to add player')
    } finally {
      setSaving(false)
    }
  }

  const startEdit = (player: RosterPlayer) => {
    setEditId(player.id)
    setEditDraft({
      name: player.name,
      number: player.number !== null ? String(player.number) : '',
      contactInfo: player.contactInfo,
      isGuest: player.isGuest,
      primaryPosition: player.primaryPosition as RosterProfilePosition,
      secondaryPosition: player.secondaryPosition as RosterProfilePosition,
    })
  }

  const saveEdit = async () => {
    if (!editId) return
    const trimmed = editDraft.name.trim()
    if (!trimmed) return
    let jersey: number | null = null
    if (editDraft.number.trim()) {
      const parsed = Number(editDraft.number.trim())
      if (Number.isNaN(parsed)) return
      jersey = parsed
    }
    setSaving(true)
    try {
      await onUpdatePlayer(editId, {
        name: trimmed,
        jersey,
        isGuest: editDraft.isGuest,
        primaryPosition: editDraft.primaryPosition,
        secondaryPosition: editDraft.secondaryPosition,
        contactInfo: editDraft.contactInfo.trim(),
      })
      onToast('Player updated')
      setEditId(null)
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Failed to update player')
    } finally {
      setSaving(false)
    }
  }

  const renderPlayerRow = (player: RosterPlayer, inactive = false) => {
    const isEditing = editId === player.id

    if (isEditing) {
      return (
        <li key={player.id} className="space-y-3 rounded-xl border border-neon/40 bg-card p-3">
          <input
            type="text"
            value={editDraft.name}
            onChange={(e) => setEditDraft((d) => ({ ...d, name: e.target.value }))}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-semibold"
            placeholder="Name"
          />
          <div className="grid grid-cols-2 gap-2">
            <input
              type="number"
              value={editDraft.number}
              onChange={(e) => setEditDraft((d) => ({ ...d, number: e.target.value }))}
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm tabular-nums"
              placeholder="Jersey"
            />
            <input
              type="text"
              value={editDraft.contactInfo}
              onChange={(e) => setEditDraft((d) => ({ ...d, contactInfo: e.target.value }))}
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
              placeholder="Contact"
            />
          </div>
          <RosterPositionFields
            idPrefix={`edit-${player.id}`}
            compact
            primaryPosition={editDraft.primaryPosition}
            secondaryPosition={editDraft.secondaryPosition}
            onPrimaryChange={(value) => setEditDraft((d) => ({ ...d, primaryPosition: value }))}
            onSecondaryChange={(value) => setEditDraft((d) => ({ ...d, secondaryPosition: value }))}
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void saveEdit()}
              disabled={saving}
              className="flex-1 rounded-lg bg-neon py-2 text-xs font-bold uppercase text-neon-foreground"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => setEditId(null)}
              className="rounded-lg bg-secondary px-4 py-2 text-xs font-bold uppercase"
            >
              Cancel
            </button>
          </div>
        </li>
      )
    }

    return (
      <li
        key={player.id}
        className={cn(
          'flex items-center gap-3 rounded-xl border px-3 py-3',
          inactive ? 'border-dashed border-border bg-card/40 opacity-70' : 'border-border bg-card',
        )}
      >
        <span className="flex size-11 shrink-0 items-center justify-center rounded-full border-2 border-neon/40 bg-neon/10 font-display text-lg font-bold tabular-nums text-neon">
          {formatJersey(player.number)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-bold text-foreground">{player.name}</p>
          <p className="text-xs text-muted-foreground">
            {player.primaryPosition}
            {player.secondaryPosition && player.secondaryPosition !== player.primaryPosition
              ? ` · ${player.secondaryPosition}`
              : ''}
          </p>
          {player.contactInfo ? (
            <p className="truncate text-xs text-muted-foreground">{player.contactInfo}</p>
          ) : null}
          {player.isGuest && (
            <span className="mt-0.5 inline-block rounded bg-secondary px-1.5 py-0.5 text-[10px] font-bold uppercase">
              Guest
            </span>
          )}
        </div>
        <div className="flex shrink-0 gap-1">
          <button
            type="button"
            aria-label={`Edit ${player.name}`}
            onClick={() => startEdit(player)}
            className="flex size-9 items-center justify-center rounded-lg bg-secondary active:scale-90"
          >
            <Pencil className="size-4" />
          </button>
          <button
            type="button"
            aria-label={inactive ? `Reactivate ${player.name}` : `Deactivate ${player.name}`}
            onClick={() =>
              void onSetPlayerActive(player.id, inactive).then(() =>
                onToast(inactive ? `${player.name} reactivated` : `${player.name} deactivated`),
              )
            }
            className="flex size-9 items-center justify-center rounded-lg bg-secondary text-danger active:scale-90"
          >
            <UserMinus className="size-4" />
          </button>
        </div>
      </li>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-bold uppercase tracking-wide text-foreground">
          Team Roster
        </h2>
        <button
          type="button"
          onClick={() => setShowAddForm((v) => !v)}
          className="flex items-center gap-1.5 rounded-lg bg-athletic px-3 py-2 text-xs font-bold uppercase text-athletic-foreground active:scale-95"
        >
          <UserPlus className="size-4" />
          Add Player
        </button>
      </div>

      {showAddForm && (
        <form onSubmit={(e) => void handleAdd(e)} className="space-y-3 rounded-xl border border-border bg-card p-4">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Player name"
            className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-base font-semibold"
            required
          />
          <div className="grid grid-cols-2 gap-2">
            <input
              type="number"
              value={number}
              onChange={(e) => setNumber(e.target.value)}
              placeholder={suggestedJersey ? `#${suggestedJersey}` : 'Jersey'}
              className="rounded-lg border border-border bg-background px-3 py-2.5 tabular-nums"
            />
            <input
              type="text"
              value={contactInfo}
              onChange={(e) => setContactInfo(e.target.value)}
              placeholder="Email / phone"
              className="rounded-lg border border-border bg-background px-3 py-2.5"
            />
          </div>
          <RosterPositionFields
            idPrefix="team-add-player"
            compact
            primaryPosition={primaryPosition}
            secondaryPosition={secondaryPosition}
            onPrimaryChange={setPrimaryPosition}
            onSecondaryChange={setSecondaryPosition}
          />
          <label className="flex items-center gap-2 text-sm font-semibold">
            <input type="checkbox" checked={isGuest} onChange={(e) => setIsGuest(e.target.checked)} />
            Guest player
          </label>
          <button
            type="submit"
            disabled={saving || !name.trim()}
            className="w-full rounded-lg bg-neon py-3 text-sm font-bold uppercase text-neon-foreground disabled:opacity-40"
          >
            {saving ? 'Adding…' : 'Add to Roster'}
          </button>
        </form>
      )}

      {rosterLoading ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Loading roster…</p>
      ) : activePlayers.length === 0 && inactivePlayers.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
          No players yet. Add your first player above.
        </p>
      ) : (
        <>
          <ul className="space-y-2">{activePlayers.map((p) => renderPlayerRow(p))}</ul>
          {inactivePlayers.length > 0 && (
            <div className="pt-2">
              <h3 className="mb-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">
                Inactive ({inactivePlayers.length})
              </h3>
              <ul className="space-y-2">{inactivePlayers.map((p) => renderPlayerRow(p, true))}</ul>
              <p className="mt-2 text-[10px] text-muted-foreground">
                Tap the remove icon on an inactive player to reactivate them.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function TeamLineupsTab({
  selectedTeamId,
  rosterLoading,
  teamRoster,
  lineupPresets,
  onRefreshPresets,
  onSavePreset,
  onDeletePreset,
  onToast,
}: Pick<
  TeamManagementScreenProps,
  | 'selectedTeamId'
  | 'rosterLoading'
  | 'teamRoster'
  | 'lineupPresets'
  | 'onRefreshPresets'
  | 'onSavePreset'
  | 'onDeletePreset'
  | 'onToast'
>) {
  const assignmentsRef = useRef<Record<string, string | null> | null>(null)
  const [presetName, setPresetName] = useState('')
  const [editingPresetId, setEditingPresetId] = useState<string | null>(null)
  const [formationId, setFormationId] = useState('3-3-2')
  const [starters, setStarters] = useState<Record<string, boolean>>({})
  const [assignmentsKey, setAssignmentsKey] = useState(0)
  const [initialSlotAssignments, setInitialSlotAssignments] = useState<
    Record<string, string | null> | undefined
  >(undefined)
  const [saving, setSaving] = useState(false)

  const activeRoster = teamRoster.filter((p) => p.activeStatus)
  const attending = Object.fromEntries(activeRoster.map((p) => [p.id, true]))

  const resetEditor = useCallback(() => {
    setEditingPresetId(null)
    setPresetName('')
    setFormationId('3-3-2')
    setStarters({})
    setInitialSlotAssignments(undefined)
    setAssignmentsKey((k) => k + 1)
  }, [])

  useEffect(() => {
    void onRefreshPresets()
  }, [selectedTeamId, onRefreshPresets])

  const loadPreset = (preset: DbLineupPreset) => {
    const parsed = parseFormationJson(preset.formation_json)
    const nextStarters: Record<string, boolean> = {}
    for (const playerId of Object.values(parsed.slotAssignments)) {
      if (playerId) nextStarters[playerId] = true
    }
    setEditingPresetId(preset.id)
    setPresetName(preset.preset_name)
    setFormationId(parsed.formationId)
    setStarters(nextStarters)
    setInitialSlotAssignments(parsed.slotAssignments)
    setAssignmentsKey((k) => k + 1)
  }

  const handleSave = async () => {
    const trimmed = presetName.trim()
    if (!trimmed || !selectedTeamId) {
      onToast('Enter a preset name')
      return
    }
    setSaving(true)
    try {
      await onSavePreset({
        presetId: editingPresetId ?? undefined,
        presetName: trimmed,
        formationId,
        slotAssignments: assignmentsRef.current ?? {},
      })
      onToast(editingPresetId ? 'Preset updated' : 'Preset saved')
      resetEditor()
      await onRefreshPresets()
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Failed to save preset')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      {lineupPresets.length > 0 && (
        <section className="rounded-xl border border-border bg-card p-4">
          <h2 className="mb-3 flex items-center gap-2 font-display text-lg font-bold uppercase tracking-wide text-foreground">
            <LayoutGrid className="size-5 text-athletic" />
            Saved Presets
          </h2>
          <ul className="space-y-2">
            {lineupPresets.map((preset) => (
              <li key={preset.id} className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => loadPreset(preset)}
                  className={cn(
                    'min-w-0 flex-1 rounded-lg border px-3 py-2.5 text-left text-sm font-bold',
                    editingPresetId === preset.id
                      ? 'border-neon bg-neon/10'
                      : 'border-border bg-secondary/40',
                  )}
                >
                  {preset.preset_name}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    void onDeletePreset(preset.id).then(() => {
                      if (editingPresetId === preset.id) resetEditor()
                      onToast('Preset deleted')
                    })
                  }
                  className="flex size-10 items-center justify-center rounded-lg bg-danger/10 text-danger"
                >
                  <Trash2 className="size-4" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="space-y-4 rounded-xl border border-border bg-card p-4">
        <h2 className="font-display text-lg font-bold uppercase tracking-wide text-foreground">
          {editingPresetId ? 'Edit Preset' : 'New Preset'}
        </h2>
        <input
          type="text"
          value={presetName}
          onChange={(e) => setPresetName(e.target.value)}
          placeholder='e.g. "3-2-1 Starting XI"'
          className="w-full rounded-xl border border-border bg-background px-4 py-3 text-base font-semibold"
        />
        {rosterLoading ? (
          <p className="text-sm text-muted-foreground">Loading roster…</p>
        ) : activeRoster.length === 0 ? (
          <p className="text-sm text-muted-foreground">Add active players on the Roster tab first.</p>
        ) : (
          <TacticalPitchLineup
            key={`${selectedTeamId}-${assignmentsKey}`}
            title="Preset Formation"
            formationId={formationId}
            onFormationChange={(id) => {
              setFormationId(id)
              setInitialSlotAssignments(undefined)
            }}
            players={activeRoster.map((player) => ({
              id: player.id,
              name: player.name,
              number: player.number,
              isGuest: player.isGuest,
              primaryPosition: player.primaryPosition,
              secondaryPosition: player.secondaryPosition,
            }))}
            attending={attending}
            starters={starters}
            maxFieldPlayers={MAX_FIELD_PLAYERS}
            initialSlotAssignments={initialSlotAssignments}
            assignmentsResetKey={assignmentsKey}
            assignmentsRef={assignmentsRef}
            onAssignStarter={(playerId) => setStarters((prev) => ({ ...prev, [playerId]: true }))}
            onRemoveStarter={(playerId) => setStarters((prev) => ({ ...prev, [playerId]: false }))}
          />
        )}
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving || !selectedTeamId || !presetName.trim()}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-neon py-4 font-display text-xl font-black uppercase text-neon-foreground disabled:opacity-40"
        >
          <Save className="size-5" />
          {saving ? 'Saving…' : editingPresetId ? 'Update Preset' : 'Save Preset'}
        </button>
      </section>
    </div>
  )
}

function TeamMatchHistoryTab({
  selectedTeamId,
  onViewRecap,
}: {
  selectedTeamId: string | null
  onViewRecap: (match: DbMatch) => void
}) {
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [matches, setMatches] = useState<DbMatch[]>([])

  useEffect(() => {
    if (!selectedTeamId) {
      setMatches([])
      setLoading(false)
      setLoadError(null)
      return
    }

    let cancelled = false

    void (async () => {
      setLoading(true)
      setLoadError(null)
      try {
        const completed = await fetchCompletedMatchesByTeamId(selectedTeamId)
        if (!cancelled) setMatches(completed)
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : 'Failed to load match history')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [selectedTeamId])

  if (!selectedTeamId) {
    return (
      <p className="rounded-xl border border-border bg-card px-4 py-8 text-center text-sm text-muted-foreground">
        Select a team to view completed matches.
      </p>
    )
  }

  if (loading) {
    return (
      <p className="py-8 text-center text-sm font-semibold text-muted-foreground">
        Loading match history…
      </p>
    )
  }

  if (loadError) {
    return (
      <div className="rounded-xl border border-danger/40 bg-card p-6 text-center">
        <p className="font-bold text-danger">Failed to load match history</p>
        <p className="mt-2 text-sm text-muted-foreground">{loadError}</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-display text-base font-bold uppercase tracking-wide text-foreground">
          Match History & Recaps
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Completed matches with post-game stats, ratings, and coach notes.
        </p>
      </div>

      {matches.length === 0 ? (
        <p className="rounded-xl border border-border bg-card px-4 py-8 text-center text-sm text-muted-foreground">
          No completed matches yet. Finish a game to see it here.
        </p>
      ) : (
        <ul className="space-y-3">
          {matches.map((match) => {
            const { dateLabel, timeLabel } = formatMatchDisplayDateTime(match)

            return (
              <li
                key={match.id}
                className="rounded-xl border border-border bg-card p-4 shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-foreground">{dateLabel}</p>
                    <p className="text-xs text-muted-foreground">{timeLabel}</p>
                    <p className="mt-2 font-display text-lg font-bold uppercase tracking-wide text-foreground">
                      vs {match.opponent}
                    </p>
                    <p className="mt-1 font-mono text-sm font-bold tabular-nums text-blue-400">
                      Final {match.home_score} – {match.away_score}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onViewRecap(match)}
                    className="shrink-0 rounded-lg bg-neon px-3 py-2 text-xs font-bold uppercase tracking-wide text-neon-foreground active:scale-95"
                  >
                    View Recap
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

export function TeamManagementScreen(props: TeamManagementScreenProps) {
  const { teams, selectedTeamId, onTeamChange, onBack } = props
  const [tab, setTab] = useState<TeamTab>('roster')
  const [selectedHistoryMatch, setSelectedHistoryMatch] = useState<DbMatch | null>(null)

  const teamName = teams.find((team) => team.id === selectedTeamId)?.name ?? 'Team'

  useEffect(() => {
    void props.onRefreshRoster()
  }, [selectedTeamId, props.onRefreshRoster])

  useEffect(() => {
    setSelectedHistoryMatch(null)
  }, [selectedTeamId, tab])

  if (selectedHistoryMatch) {
    return (
      <MatchRecapDetailView
        match={selectedHistoryMatch}
        teamName={teamName}
        roster={props.teamRoster}
        onBack={() => setSelectedHistoryMatch(null)}
      />
    )
  }

  return (
    <main className="min-h-dvh bg-background pb-10">
      <div className="mx-auto max-w-md space-y-5 px-4 pt-6">
        <header className="flex items-start gap-3">
          <button
            type="button"
            onClick={onBack}
            aria-label="Back to home"
            className="mt-1 flex size-10 shrink-0 items-center justify-center rounded-lg bg-secondary active:scale-90"
          >
            <ArrowLeft className="size-5" />
          </button>
          <div>
            <h1 className="font-display text-3xl font-bold uppercase tracking-wide text-foreground">
              Team Management
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Roster, preset lineups, and match history for your squad.
            </p>
          </div>
        </header>

        <div>
          <label
            htmlFor="team-mgmt-team"
            className="mb-2 block text-xs font-bold uppercase tracking-widest text-muted-foreground"
          >
            Team
          </label>
          <select
            id="team-mgmt-team"
            value={selectedTeamId ?? ''}
            onChange={(e) => onTeamChange(e.target.value)}
            className="w-full rounded-xl border border-border bg-card px-4 py-3 text-lg font-semibold text-foreground focus:border-neon focus:outline-none focus:ring-2 focus:ring-neon/30"
          >
            {teams.length === 0 ? (
              <option value="">No teams yet</option>
            ) : (
              teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))
            )}
          </select>
        </div>

        <div className="flex gap-1 rounded-xl border border-border bg-card p-1">
          <TabButton active={tab === 'roster'} onClick={() => setTab('roster')}>
            <span className="inline-flex items-center justify-center gap-1">
              <Users className="size-3.5" />
              Roster
            </span>
          </TabButton>
          <TabButton active={tab === 'lineups'} onClick={() => setTab('lineups')}>
            <span className="inline-flex items-center justify-center gap-1">
              <LayoutGrid className="size-3.5" />
              Lineups
            </span>
          </TabButton>
          <TabButton active={tab === 'history'} onClick={() => setTab('history')}>
            <span className="inline-flex items-center justify-center gap-1">
              <History className="size-3.5" />
              History
            </span>
          </TabButton>
        </div>

        {tab === 'roster' && (
          <TeamRosterTab
            rosterLoading={props.rosterLoading}
            teamRoster={props.teamRoster}
            suggestedJersey={props.suggestedJersey}
            onAddPlayer={props.onAddPlayer}
            onUpdatePlayer={props.onUpdatePlayer}
            onSetPlayerActive={props.onSetPlayerActive}
            onToast={props.onToast}
          />
        )}
        {tab === 'lineups' && (
          <TeamLineupsTab
            selectedTeamId={props.selectedTeamId}
            rosterLoading={props.rosterLoading}
            teamRoster={props.teamRoster}
            lineupPresets={props.lineupPresets}
            onRefreshPresets={props.onRefreshPresets}
            onSavePreset={props.onSavePreset}
            onDeletePreset={props.onDeletePreset}
            onToast={props.onToast}
          />
        )}
        {tab === 'history' && (
          <TeamMatchHistoryTab
            selectedTeamId={props.selectedTeamId}
            onViewRecap={setSelectedHistoryMatch}
          />
        )}
      </div>
    </main>
  )
}
