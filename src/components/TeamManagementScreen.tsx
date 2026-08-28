import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import {
  Archive,
  LayoutGrid,
  Pencil,
  Save,
  Settings,
  Trash2,
  UserPlus,
  Users,
} from 'lucide-react'
import { ScreenHeader } from '@/components/AppNavigation'
import {
  DEFAULT_PRIMARY_POSITION,
  DEFAULT_SECONDARY_POSITION,
  RosterPositionFields,
} from '@/components/RosterPositionFields'
import { SprocketImportSection } from '@/components/SprocketImportSection'
import { TacticalPitchLineup } from '@/components/TacticalPitchLineup'
import { parseFormationJson, validatePresetFormation } from '@/lib/lineup-presets'
import type { LocationType } from '@/lib/match-location'
import { getDefaultFormationId, isFormationValidForFormat } from '@/lib/formations'
import { getMaxFieldPlayers } from '@/lib/lineup'
import { formatPlayerFullName, buildSidelineNameMap, getSidelineName } from '@/lib/player-names'
import {
  teamFormatLabel,
  type TeamFormat,
} from '@/lib/team-format'
import {
  type AgeGroup,
  ageGroupFormatHint,
} from '@/lib/age-groups'
import { cn } from '@/lib/utils'
import { APP_CONTAINER, APP_SHELL } from '@/lib/layout'
import type { DbLineupPreset, DbMatch } from '@/types/database'
import type { RosterProfilePosition } from '@/lib/positions'

import type { RosterPlayer } from '@/types/match'

type TeamTab = 'roster' | 'lineups' | 'settings'

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
        'flex min-h-11 flex-1 touch-manipulation items-center justify-center rounded-lg px-2 py-3 text-xs font-bold uppercase tracking-wide transition-colors active:scale-[0.98]',
        active ? 'bg-neon text-neon-foreground' : 'bg-secondary text-muted-foreground',
      )}
    >
      {children}
    </button>
  )
}

type TeamManagementScreenProps = {
  activeTeamId: string | null
  activeTeamName: string
  activeTeamFormat: TeamFormat
  activeTeamAgeGroup: AgeGroup | null
  teamSwitcher?: ReactNode
  rosterLoading: boolean
  teamRoster: RosterPlayer[]
  suggestedJersey: number
  lineupPresets: DbLineupPreset[]
  onRefreshPresets: () => Promise<void>
  onRefreshRoster: () => Promise<void>
  onAddPlayer: (input: {
    firstName: string
    lastName: string
    jersey: number | null
    isGuest: boolean
    primaryPosition?: string
    secondaryPosition?: string
  }) => Promise<unknown>
  onUpdatePlayer: (
    id: string,
    updates: {
      firstName: string
      lastName: string
      jersey: number | null
      isGuest: boolean
      primaryPosition?: string
      secondaryPosition?: string
    },
  ) => Promise<unknown>
  onSetPlayerActive: (id: string, active: boolean) => Promise<void>
  onSavePreset: (input: {
    presetId?: string
    presetName: string
    formationId: string
    slotAssignments: Record<string, string | null>
    slotLabelOverrides?: Record<string, string>
  }) => Promise<void>
  onDeletePreset: (presetId: string) => Promise<void>
  primaryCoachName: string
  onUpdatePrimaryCoach: (name: string) => Promise<void>
  /** Known Directors / Staff / coach-directory names for the primary coach dropdown. */
  coachOptions: string[]
  scheduledMatches: DbMatch[]
  scheduledLoading: boolean
  onRefreshScheduledMatches: () => Promise<void>
  onCreateScheduledMatch: (input: {
    opponent: string
    locationType: LocationType
    matchDate: string
    matchTime: string
  }) => Promise<unknown>
  onDeleteScheduledMatch: (matchId: string) => Promise<void>
  onUseScheduledMatch: (match: DbMatch) => void
  onBackToHome: () => void
  onToast: (message: string) => void
  canUseSprocketIntegration?: boolean
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
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [number, setNumber] = useState('')
  const [primaryPosition, setPrimaryPosition] = useState<RosterProfilePosition>(DEFAULT_PRIMARY_POSITION)
  const [secondaryPosition, setSecondaryPosition] =
    useState<RosterProfilePosition>(DEFAULT_SECONDARY_POSITION)
  const [isGuest, setIsGuest] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState({
    firstName: '',
    lastName: '',
    number: '',
    isGuest: false,
    primaryPosition: DEFAULT_PRIMARY_POSITION as RosterProfilePosition,
    secondaryPosition: DEFAULT_SECONDARY_POSITION as RosterProfilePosition,
  })

  const activePlayers = teamRoster.filter((p) => p.activeStatus)
  const archivedPlayers = teamRoster.filter((p) => !p.activeStatus)

  const resetAddForm = () => {
    setFirstName('')
    setLastName('')
    setNumber('')
    setPrimaryPosition(DEFAULT_PRIMARY_POSITION)
    setSecondaryPosition(DEFAULT_SECONDARY_POSITION)
    setIsGuest(false)
    setShowAddForm(false)
  }

  const handleAdd = async (e: FormEvent) => {
    e.preventDefault()
    const trimmedFirst = firstName.trim()
    const trimmedLast = lastName.trim()
    if (!trimmedFirst || !trimmedLast) return
    let jersey: number | null = null
    if (number.trim()) {
      const parsed = Number(number.trim())
      if (Number.isNaN(parsed)) return
      jersey = parsed
    }
    setSaving(true)
    try {
      await onAddPlayer({
        firstName: trimmedFirst,
        lastName: trimmedLast,
        jersey,
        isGuest,
        primaryPosition,
        secondaryPosition,
      })
      onToast(`Added ${formatPlayerFullName(trimmedFirst, trimmedLast)}`)
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
      firstName: player.firstName,
      lastName: player.lastName,
      number: player.number !== null ? String(player.number) : '',
      isGuest: player.isGuest,
      primaryPosition: player.primaryPosition as RosterProfilePosition,
      secondaryPosition: player.secondaryPosition as RosterProfilePosition,
    })
  }

  const saveEdit = async () => {
    if (!editId) return
    const trimmedFirst = editDraft.firstName.trim()
    const trimmedLast = editDraft.lastName.trim()
    if (!trimmedFirst || !trimmedLast) return
    let jersey: number | null = null
    if (editDraft.number.trim()) {
      const parsed = Number(editDraft.number.trim())
      if (Number.isNaN(parsed)) return
      jersey = parsed
    }
    setSaving(true)
    try {
      await onUpdatePlayer(editId, {
        firstName: trimmedFirst,
        lastName: trimmedLast,
        jersey,
        isGuest: editDraft.isGuest,
        primaryPosition: editDraft.primaryPosition,
        secondaryPosition: editDraft.secondaryPosition,
      })
      onToast(`Updated ${formatPlayerFullName(trimmedFirst, trimmedLast)}`)
      setEditId(null)
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Failed to update player')
    } finally {
      setSaving(false)
    }
  }

  const renderPlayerRow = (player: RosterPlayer, archived = false) => {
    const isEditing = editId === player.id

    if (isEditing) {
      return (
        <li key={player.id} className="space-y-3 rounded-xl border border-neon/40 bg-card p-3">
          <div className="grid grid-cols-2 gap-2">
            <input
              type="text"
              required
              value={editDraft.firstName}
              onChange={(e) => setEditDraft((d) => ({ ...d, firstName: e.target.value }))}
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm font-semibold"
              placeholder="First name"
            />
            <input
              type="text"
              required
              value={editDraft.lastName}
              onChange={(e) => setEditDraft((d) => ({ ...d, lastName: e.target.value }))}
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm font-semibold"
              placeholder="Last name"
            />
          </div>
          <input
            type="number"
            value={editDraft.number}
            onChange={(e) => setEditDraft((d) => ({ ...d, number: e.target.value }))}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm tabular-nums"
            placeholder="Jersey"
          />
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
          archived ? 'border-dashed border-border bg-card/40 opacity-70' : 'border-border bg-card',
        )}
      >
        <span className="flex size-11 shrink-0 items-center justify-center rounded-full border-2 border-neon/40 bg-neon/10 font-display text-lg font-bold tabular-nums text-neon">
          {formatJersey(player.number)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-bold text-foreground">
            {formatPlayerFullName(player.firstName, player.lastName)}
          </p>
          <p className="text-xs text-muted-foreground">
            {player.primaryPosition}
            {player.secondaryPosition && player.secondaryPosition !== player.primaryPosition
              ? ` · ${player.secondaryPosition}`
              : ''}
          </p>
          {player.isGuest && (
            <span className="mt-0.5 inline-block rounded bg-secondary px-1.5 py-0.5 text-[10px] font-bold uppercase">
              Guest
            </span>
          )}
        </div>
        <div className="flex shrink-0 gap-1">
          <button
            type="button"
            aria-label={`Edit ${formatPlayerFullName(player.firstName, player.lastName)}`}
            onClick={() => startEdit(player)}
            className="flex size-9 items-center justify-center rounded-lg bg-secondary active:scale-90"
          >
            <Pencil className="size-4" />
          </button>
          <button
            type="button"
            aria-label={
              archived
                ? `Restore ${formatPlayerFullName(player.firstName, player.lastName)}`
                : `Archive ${formatPlayerFullName(player.firstName, player.lastName)}`
            }
            onClick={() =>
              void onSetPlayerActive(player.id, archived).then(() =>
                onToast(
                  archived
                    ? `${formatPlayerFullName(player.firstName, player.lastName)} restored`
                    : `${formatPlayerFullName(player.firstName, player.lastName)} archived`,
                ),
              )
            }
            className="flex size-9 items-center justify-center rounded-lg bg-secondary text-foreground active:scale-90"
          >
            <Archive className="size-4" />
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
          <div className="grid grid-cols-2 gap-2">
            <input
              type="text"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder="First name"
              className="rounded-lg border border-border bg-background px-3 py-2.5 text-base font-semibold"
              required
            />
            <input
              type="text"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              placeholder="Last name"
              className="rounded-lg border border-border bg-background px-3 py-2.5 text-base font-semibold"
              required
            />
          </div>
          <input
            type="number"
            value={number}
            onChange={(e) => setNumber(e.target.value)}
            placeholder={suggestedJersey ? `#${suggestedJersey}` : 'Jersey'}
            className="w-full rounded-lg border border-border bg-background px-3 py-2.5 tabular-nums"
          />
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
            disabled={saving || !firstName.trim() || !lastName.trim()}
            className="w-full rounded-lg bg-neon py-3 text-sm font-bold uppercase text-neon-foreground disabled:opacity-40"
          >
            {saving ? 'Adding…' : 'Add to Roster'}
          </button>
        </form>
      )}

      {rosterLoading ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Loading roster…</p>
      ) : activePlayers.length === 0 && archivedPlayers.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
          No players yet. Add your first player above.
        </p>
      ) : (
        <>
          <ul className="space-y-2">{activePlayers.map((p) => renderPlayerRow(p))}</ul>
          {archivedPlayers.length > 0 && (
            <div className="pt-2">
              <h3 className="mb-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">
                Archived ({archivedPlayers.length})
              </h3>
              <ul className="space-y-2">{archivedPlayers.map((p) => renderPlayerRow(p, true))}</ul>
              <p className="mt-2 text-[10px] text-muted-foreground">
                Archived players stay in history for stats. Tap archive again to restore them.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function TeamSettingsTab({
  activeTeamId,
  activeTeamName,
  activeTeamFormat,
  activeTeamAgeGroup,
  primaryCoachName,
  onUpdatePrimaryCoach,
  coachOptions,
  scheduledMatches,
  scheduledLoading,
  onRefreshScheduledMatches,
  onAddPlayer,
  onCreateScheduledMatch,
  onDeleteScheduledMatch,
  onUseScheduledMatch,
  onToast,
  canUseSprocketIntegration = false,
}: Pick<
  TeamManagementScreenProps,
  | 'activeTeamId'
  | 'activeTeamName'
  | 'activeTeamFormat'
  | 'activeTeamAgeGroup'
  | 'primaryCoachName'
  | 'onUpdatePrimaryCoach'
  | 'coachOptions'
  | 'scheduledMatches'
  | 'scheduledLoading'
  | 'onRefreshScheduledMatches'
  | 'onAddPlayer'
  | 'onCreateScheduledMatch'
  | 'onDeleteScheduledMatch'
  | 'onUseScheduledMatch'
  | 'onToast'
  | 'canUseSprocketIntegration'
>) {
  const [coachName, setCoachName] = useState(primaryCoachName)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setCoachName(primaryCoachName)
  }, [primaryCoachName])

  const knownOptions = useMemo(() => {
    const names = new Set<string>()
    for (const name of coachOptions) {
      const trimmed = name.trim()
      if (trimmed) names.add(trimmed)
    }
    return [...names].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
  }, [coachOptions])

  const selectedCoach = useMemo(() => {
    const needle = coachName.trim().toLowerCase()
    if (!needle) return ''
    return knownOptions.find((name) => name.toLowerCase() === needle) ?? ''
  }, [coachName, knownOptions])

  const coachChanged = selectedCoach !== primaryCoachName.trim()
  const canSave = Boolean(selectedCoach) && coachChanged && !saving

  const handleSave = async () => {
    if (!canSave || !selectedCoach) return
    setSaving(true)
    try {
      await onUpdatePrimaryCoach(selectedCoach)
      onToast('Team settings saved')
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Failed to save team settings')
      setCoachName(primaryCoachName)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <section className="space-y-4 rounded-xl border border-border bg-card p-4">
        <h2 className="flex items-center gap-2 font-display text-lg font-bold uppercase tracking-wide text-foreground">
          <Settings className="size-5 text-athletic" />
          Team Settings
        </h2>

        <div className="rounded-xl border border-border bg-secondary/40 px-3 py-3">
          <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
            Age group &amp; lineup
          </p>
          <p className="mt-1 text-sm font-bold text-foreground">
            {activeTeamAgeGroup
              ? ageGroupFormatHint(activeTeamAgeGroup)
              : teamFormatLabel(activeTeamFormat)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Directors edit team name and age group in Club Admin.
          </p>
        </div>

        <div>
          <label
            htmlFor="primary-coach-name"
            className="mb-1.5 block text-xs font-bold uppercase tracking-widest text-muted-foreground"
          >
            Primary Coach
          </label>
          <select
            id="primary-coach-name"
            value={selectedCoach}
            onChange={(e) => setCoachName(e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm font-bold text-foreground focus:border-neon focus:outline-none focus:ring-2 focus:ring-neon/30"
          >
            <option value="" disabled>
              Select a coach…
            </option>
            {knownOptions.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
          <p className="mt-2 text-sm text-muted-foreground">
            Default head coach for new games with this team. Choose from club Directors and coaches
            only — you can still override on game day.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={!canSave}
          className="w-full rounded-xl bg-athletic py-3 text-sm font-bold uppercase tracking-wide text-athletic-foreground disabled:opacity-40"
        >
          {saving ? 'Saving…' : 'Save Settings'}
        </button>
      </section>

      {canUseSprocketIntegration ? (
        <SprocketImportSection
          activeTeamId={activeTeamId}
          activeTeamName={activeTeamName}
          scheduledMatches={scheduledMatches}
          scheduledLoading={scheduledLoading}
          onRefreshScheduledMatches={onRefreshScheduledMatches}
          onAddPlayer={onAddPlayer}
          onCreateScheduledMatch={onCreateScheduledMatch}
          onDeleteScheduledMatch={onDeleteScheduledMatch}
          onUseScheduledMatch={onUseScheduledMatch}
          onToast={onToast}
        />
      ) : (
        <p className="rounded-xl border-2 border-border bg-secondary/30 px-4 py-3 text-xs font-semibold text-muted-foreground">
          Sprocket Sports import is available to Directors and Head Coaches.
        </p>
      )}
    </div>
  )
}

function TeamLineupsTab({
  activeTeamId,
  activeTeamFormat,
  rosterLoading,
  teamRoster,
  lineupPresets,
  onRefreshPresets,
  onSavePreset,
  onDeletePreset,
  onToast,
}: Pick<
  TeamManagementScreenProps,
  | 'activeTeamId'
  | 'activeTeamFormat'
  | 'rosterLoading'
  | 'teamRoster'
  | 'lineupPresets'
  | 'onRefreshPresets'
  | 'onSavePreset'
  | 'onDeletePreset'
  | 'onToast'
>) {
  const maxFieldPlayers = getMaxFieldPlayers(activeTeamFormat)
  const defaultFormationId = getDefaultFormationId(activeTeamFormat)
  const assignmentsRef = useRef<Record<string, string | null> | null>(null)
  const labelOverridesRef = useRef<Record<string, string> | null>(null)
  const [presetName, setPresetName] = useState('')
  const [editingPresetId, setEditingPresetId] = useState<string | null>(null)
  const [formationId, setFormationId] = useState(defaultFormationId)
  const [starters, setStarters] = useState<Record<string, boolean>>({})
  const [assignmentsKey, setAssignmentsKey] = useState(0)
  const [initialSlotAssignments, setInitialSlotAssignments] = useState<
    Record<string, string | null> | undefined
  >(undefined)
  const [initialSlotLabelOverrides, setInitialSlotLabelOverrides] = useState<
    Record<string, string> | undefined
  >(undefined)
  const [saving, setSaving] = useState(false)

  const activeRoster = teamRoster.filter((p) => p.activeStatus)
  const attending = Object.fromEntries(activeRoster.map((p) => [p.id, true]))
  const sidelineNames = useMemo(
    () => buildSidelineNameMap(activeRoster),
    [activeRoster],
  )

  const resetEditor = useCallback(() => {
    setEditingPresetId(null)
    setPresetName('')
    setFormationId(defaultFormationId)
    setStarters({})
    setInitialSlotAssignments(undefined)
    setInitialSlotLabelOverrides(undefined)
    setAssignmentsKey((k) => k + 1)
  }, [defaultFormationId])

  useEffect(() => {
    resetEditor()
  }, [activeTeamFormat, resetEditor])

  useEffect(() => {
    void onRefreshPresets()
  }, [activeTeamId, onRefreshPresets])

  const loadPreset = (preset: DbLineupPreset) => {
    const parsed = parseFormationJson(preset.formation_json, activeTeamFormat)
    if (!isFormationValidForFormat(parsed.formationId, activeTeamFormat)) {
      onToast(`This preset doesn't match the team's ${activeTeamFormat} format.`)
      return
    }
    const nextStarters: Record<string, boolean> = {}
    for (const playerId of Object.values(parsed.slotAssignments)) {
      if (playerId) nextStarters[playerId] = true
    }
    setEditingPresetId(preset.id)
    setPresetName(preset.preset_name)
    setFormationId(parsed.formationId)
    setStarters(nextStarters)
    setInitialSlotAssignments(parsed.slotAssignments)
    setInitialSlotLabelOverrides(parsed.slotLabelOverrides ?? {})
    setAssignmentsKey((k) => k + 1)
  }

  const handleSave = async () => {
    const trimmed = presetName.trim()
    if (!trimmed || !activeTeamId) {
      onToast('Enter a preset name')
      return
    }
    setSaving(true)
    try {
      validatePresetFormation(formationId, activeTeamFormat)
      await onSavePreset({
        presetId: editingPresetId ?? undefined,
        presetName: trimmed,
        formationId,
        slotAssignments: assignmentsRef.current ?? {},
        slotLabelOverrides: labelOverridesRef.current ?? initialSlotLabelOverrides ?? {},
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
            key={`${activeTeamId}-${assignmentsKey}`}
            title="Preset Formation"
            formationId={formationId}
            onFormationChange={(id) => {
              setFormationId(id)
              setInitialSlotAssignments(undefined)
              setInitialSlotLabelOverrides(undefined)
            }}
            players={activeRoster.map((player) => ({
              id: player.id,
              name: getSidelineName(player, sidelineNames),
              number: player.number,
              isGuest: player.isGuest,
              primaryPosition: player.primaryPosition,
              secondaryPosition: player.secondaryPosition,
            }))}
            attending={attending}
            starters={starters}
            maxFieldPlayers={maxFieldPlayers}
            teamFormat={activeTeamFormat}
            initialSlotAssignments={initialSlotAssignments}
            initialSlotLabelOverrides={initialSlotLabelOverrides}
            assignmentsResetKey={assignmentsKey}
            assignmentsRef={assignmentsRef}
            slotLabelOverridesRef={labelOverridesRef}
            onSlotAssignmentsChange={(next) => {
              assignmentsRef.current = next
            }}
            onSlotLabelOverridesChange={(next) => {
              labelOverridesRef.current = next
              setInitialSlotLabelOverrides(next)
            }}
            onAssignStarter={(playerId) => setStarters((prev) => ({ ...prev, [playerId]: true }))}
            onRemoveStarter={(playerId) => setStarters((prev) => ({ ...prev, [playerId]: false }))}
          />
        )}
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving || !activeTeamId || !presetName.trim()}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-neon py-4 font-display text-xl font-black uppercase text-neon-foreground disabled:opacity-40"
        >
          <Save className="size-5" />
          {saving ? 'Saving…' : editingPresetId ? 'Update Preset' : 'Save Preset'}
        </button>
      </section>
    </div>
  )
}

export function TeamManagementScreen(props: TeamManagementScreenProps) {
  const { activeTeamId, activeTeamName, teamSwitcher, onBackToHome } = props
  const [tab, setTab] = useState<TeamTab>('roster')

  useEffect(() => {
    void props.onRefreshRoster()
  }, [activeTeamId, props.onRefreshRoster])

  return (
    <main className={`${APP_SHELL} pb-10 md:pb-12`}>
      <div className={`${APP_CONTAINER} space-y-5 pt-6 md:space-y-6 md:pt-8`}>
        <ScreenHeader
          title="Team Management"
          subtitle={`Roster and preset lineups for ${activeTeamName || 'your team'}.`}
          onHome={onBackToHome}
          teamSwitcher={teamSwitcher}
        />

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
          <TabButton active={tab === 'settings'} onClick={() => setTab('settings')}>
            <span className="inline-flex items-center justify-center gap-1">
              <Settings className="size-3.5" />
              Settings
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
            activeTeamId={props.activeTeamId}
            activeTeamFormat={props.activeTeamFormat}
            rosterLoading={props.rosterLoading}
            teamRoster={props.teamRoster}
            lineupPresets={props.lineupPresets}
            onRefreshPresets={props.onRefreshPresets}
            onSavePreset={props.onSavePreset}
            onDeletePreset={props.onDeletePreset}
            onToast={props.onToast}
          />
        )}
        {tab === 'settings' && (
          <TeamSettingsTab
            activeTeamId={props.activeTeamId}
            activeTeamName={props.activeTeamName}
            activeTeamFormat={props.activeTeamFormat}
            activeTeamAgeGroup={props.activeTeamAgeGroup}
            primaryCoachName={props.primaryCoachName}
            onUpdatePrimaryCoach={props.onUpdatePrimaryCoach}
            coachOptions={props.coachOptions}
            scheduledMatches={props.scheduledMatches}
            scheduledLoading={props.scheduledLoading}
            onRefreshScheduledMatches={props.onRefreshScheduledMatches}
            onAddPlayer={props.onAddPlayer}
            onCreateScheduledMatch={props.onCreateScheduledMatch}
            onDeleteScheduledMatch={props.onDeleteScheduledMatch}
            onUseScheduledMatch={props.onUseScheduledMatch}
            onToast={props.onToast}
            canUseSprocketIntegration={props.canUseSprocketIntegration}
          />
        )}
      </div>
    </main>
  )
}
