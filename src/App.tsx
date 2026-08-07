import { useCallback, useEffect, useRef, useState, type FormEvent, type MutableRefObject } from 'react'
import {
  CheckCircle2,
  Goal,
  UserPlus,
  Users,
  X,
} from 'lucide-react'
import { GoalWizardModal } from '@/components/GoalWizardModal'
import { TeamManagementScreen } from '@/components/TeamManagementScreen'
import {
  LiveTacticalPitch,
  type LiveTacticalPitchHandle,
  type PositionReassignUpdate,
} from '@/components/LiveTacticalPitch'
import { PostGameRecap } from '@/components/PostGameRecap'
import {
  DEFAULT_PRIMARY_POSITION,
  DEFAULT_SECONDARY_POSITION,
  RosterPositionFields,
} from '@/components/RosterPositionFields'
import { TacticalPitchLineup } from '@/components/TacticalPitchLineup'
import { useGameDayApp } from '@/hooks/useGameDayApp'
import type { FormationRole } from '@/lib/formations'
import {
  getAttendingIds,
  getFirstHalfStarterIds,
  isHalftimeLineupValid,
  isSetupLineupValid,
  MAX_FIELD_PLAYERS,
} from '@/lib/lineup'
import {
  applySubIn,
  applySubOut,
  applySubstitution,
  formatPlayingTimeBadge,
  stampAllOnField,
} from '@/lib/play-time'
import { elapsedInHalf, halfDurationSeconds, isHalfExpired, QA_SPEED_MULTIPLIERS, tickCountdownClock, type QaSpeedMultiplier } from '@/lib/match-clock'
import { ADD_NEW_OPTION } from '@/lib/named-entities'
import type { RosterProfilePosition } from '@/lib/positions'
import {
  syncMatchClock,
  syncMatchEvent,
  syncMatchEvents,
  syncMatchRecord,
  syncMatchStat,
  syncMatchStats,
  upsertMatchStats,
  formatSupabaseError,
} from '@/lib/supabase-api'
import { cn } from '@/lib/utils'
import type {
  MatchPeriod,
  MatchPlayer,
  RosterPlayer,
  SetupLineup,
} from '@/types/match'


const HALF_LENGTH_OPTIONS = [25, 30, 35, 40, 45]

function nextJerseyNumber(roster: RosterPlayer[]) {
  const used = new Set(roster.map((p) => p.number).filter((n): n is number => n !== null))
  for (let n = 1; n <= 99; n++) {
    if (!used.has(n)) return n
  }
  return roster.length + 1
}

function periodLabel(period: MatchPeriod) {
  return period === '1st' ? '1st Half' : '2nd Half'
}

type NamedEntity = { id: string; name: string }

type EntitySelectProps = {
  id: string
  label: string
  valueId: string | null
  options: NamedEntity[]
  addNewLabel: string
  placeholder: string
  onChange: (id: string) => void
  onAddNew: (name: string) => Promise<string | void>
}

function EntitySelect({
  id,
  label,
  valueId,
  options,
  addNewLabel,
  placeholder,
  onChange,
  onAddNew,
}: EntitySelectProps) {
  const [isAdding, setIsAdding] = useState(false)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)

  const selectValue = isAdding ? ADD_NEW_OPTION : valueId ?? ''

  const commitDraft = async () => {
    const trimmed = draft.trim()
    if (!trimmed) {
      setIsAdding(false)
      return
    }
    setSaving(true)
    try {
      const newId = await onAddNew(trimmed)
      if (newId) onChange(newId)
      setDraft('')
      setIsAdding(false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <label
        htmlFor={id}
        className="mb-2 block text-xs font-bold uppercase tracking-widest text-muted-foreground"
      >
        {label}
      </label>
      <select
        id={id}
        value={selectValue}
        disabled={saving}
        onChange={(e) => {
          if (e.target.value === ADD_NEW_OPTION) {
            setIsAdding(true)
            setDraft('')
            return
          }
          setIsAdding(false)
          onChange(e.target.value)
        }}
        className="w-full rounded-xl border border-border bg-card px-4 py-3 text-lg font-semibold text-foreground focus:border-neon focus:outline-none focus:ring-2 focus:ring-neon/30 disabled:opacity-60"
      >
        {options.length === 0 && !valueId ? (
          <option value="" disabled>
            Select or add…
          </option>
        ) : !valueId && !isAdding ? (
          <option value="" disabled>
            Select a team…
          </option>
        ) : null}
        {options.map((entity) => (
          <option key={entity.id} value={entity.id}>
            {entity.name}
          </option>
        ))}
        <option value={ADD_NEW_OPTION}>{addNewLabel}</option>
      </select>
      {isAdding && (
        <input
          type="text"
          autoFocus
          value={draft}
          disabled={saving}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void commitDraft()
            if (e.key === 'Escape') {
              setDraft('')
              setIsAdding(false)
            }
          }}
          onBlur={() => void commitDraft()}
          placeholder={placeholder}
          className="mt-2 w-full rounded-xl border border-neon/50 bg-card px-4 py-3 text-lg font-semibold text-foreground placeholder:text-muted-foreground focus:border-neon focus:outline-none focus:ring-2 focus:ring-neon/30"
        />
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* MatchHeader                                                         */
/* ------------------------------------------------------------------ */

function formatClock(totalSeconds: number) {
  const m = Math.floor(totalSeconds / 60)
  const s = totalSeconds % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

type MatchHeaderProps = {
  teamName: string
  coachName: string
  opponent: string
  homeScore: number
  awayScore: number
  seconds: number
  period: MatchPeriod
  halfLengthMinutes: number
  running: boolean
  periodClockStarted: boolean
}

function MatchHeader({
  teamName,
  coachName,
  opponent,
  homeScore,
  awayScore,
  seconds,
  period,
  halfLengthMinutes,
  running,
  periodClockStarted,
}: MatchHeaderProps) {
  const homeLabel = teamName.trim() || 'Home'
  const awayName = opponent.trim() || 'Opponent'
  const halfReference = formatClock(halfDurationSeconds(halfLengthMinutes))
  const coachLine = coachName.trim() ? `Coach: ${coachName.trim()}` : null
  const halfEnded = periodClockStarted && isHalfExpired(seconds)
  const waitingToStart = !periodClockStarted

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="mx-auto max-w-md px-4 pb-4 pt-3">
        <div className="flex items-center justify-center gap-2 text-center text-sm font-semibold">
          <span className="text-foreground">{homeLabel}</span>
          <span className="rounded bg-neon px-1.5 py-0.5 text-[10px] font-bold text-neon-foreground">
            H
          </span>
          <span className="text-muted-foreground">vs.</span>
          <span className="text-foreground">{awayName}</span>
          <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground">
            A
          </span>
        </div>

        <p className="mt-1 text-center text-xs font-semibold text-muted-foreground">
          {homeLabel} {homeScore} – {awayScore} {awayName}
          {coachLine ? ` · ${coachLine}` : ''}
        </p>

        <div className="mt-2 flex flex-col items-center gap-1">
          <div className="flex items-center justify-center gap-2">
            {running && (
              <span className="flex size-2 items-center justify-center">
                <span className="size-2 animate-pulse rounded-full bg-neon" />
              </span>
            )}
            {halfEnded && (
              <span className="rounded bg-orange-600 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-white animate-pulse">
                Half Ended
              </span>
            )}
            <span
              className={cn(
                'font-display text-4xl font-bold tabular-nums tracking-wider',
                halfEnded ? 'text-orange-500' : waitingToStart ? 'text-muted-foreground' : 'text-neon',
              )}
            >
              {formatClock(seconds)}
            </span>
            <span className="rounded bg-secondary px-2 py-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">
              {periodLabel(period)}
            </span>
          </div>
          <span className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
            {waitingToStart
              ? `Ready · ${halfReference} countdown`
              : halfEnded
                ? 'Clock stopped · confirm below'
                : `Countdown · ${halfReference} half`}
          </span>
        </div>
      </div>
    </header>
  )
}

/* ------------------------------------------------------------------ */
/* SetupScreen                                                         */
/* ------------------------------------------------------------------ */

type PlayerEditDraft = {
  id: string
  name: string
  number: string
  isGuest: boolean
  primaryPosition: RosterProfilePosition
  secondaryPosition: RosterProfilePosition
}

type AddPlayerToRosterProps = {
  selectedTeamId: string | null
  suggestedJersey: number
  onAdd: (input: {
    name: string
    jersey: number | null
    isGuest: boolean
    primaryPosition?: string
    secondaryPosition?: string
  }) => Promise<void>
}

function AddPlayerToRoster({ selectedTeamId, suggestedJersey, onAdd }: AddPlayerToRosterProps) {
  const [expanded, setExpanded] = useState(false)
  const [name, setName] = useState('')
  const [number, setNumber] = useState('')
  const [isGuest, setIsGuest] = useState(false)
  const [primaryPosition, setPrimaryPosition] = useState<RosterProfilePosition>(DEFAULT_PRIMARY_POSITION)
  const [secondaryPosition, setSecondaryPosition] =
    useState<RosterProfilePosition>(DEFAULT_SECONDARY_POSITION)
  const [saving, setSaving] = useState(false)

  const teamSelected = Boolean(selectedTeamId)
  const canSubmit = teamSelected && name.trim().length > 0 && !saving

  const resetForm = () => {
    setName('')
    setIsGuest(false)
    setNumber('')
    setPrimaryPosition(DEFAULT_PRIMARY_POSITION)
    setSecondaryPosition(DEFAULT_SECONDARY_POSITION)
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!canSubmit || !selectedTeamId) return

    const trimmed = name.trim()
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
        name: trimmed,
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
        + Add Guest/New Player
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
          New Player
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

      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-3">
          <div>
            <label
              htmlFor="new-player-name"
              className="mb-1.5 block text-xs font-bold uppercase tracking-widest text-muted-foreground"
            >
              Name
            </label>
            <input
              id="new-player-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Player name"
              className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-base font-semibold text-foreground placeholder:text-muted-foreground focus:border-neon focus:outline-none focus:ring-2 focus:ring-neon/30"
            />
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
            disabled={!canSubmit}
            className="w-full rounded-lg bg-athletic py-3 text-sm font-bold uppercase tracking-wide text-athletic-foreground active:scale-[0.98] disabled:opacity-40"
          >
            {saving ? 'Adding…' : 'Add Player'}
          </button>
        </form>
    </section>
  )
}

type SetupScreenProps = {
  teams: NamedEntity[]
  selectedTeamId: string | null
  onTeamChange: (id: string) => void
  onAddTeam: (name: string) => Promise<string | void>
  coaches: NamedEntity[]
  selectedCoachId: string | null
  onCoachChange: (id: string) => void
  onAddCoach: (name: string) => Promise<void>
  rosterLoading: boolean
  suggestedJersey: number
  onAddPlayer: (input: {
    name: string
    jersey: number | null
    isGuest: boolean
    primaryPosition?: string
    secondaryPosition?: string
  }) => Promise<void>
  opponent: string
  onOpponentChange: (value: string) => void
  matchDate: string
  onMatchDateChange: (value: string) => void
  matchTime: string
  onMatchTimeChange: (value: string) => void
  location: string
  onLocationChange: (value: string) => void
  tournamentGame: boolean
  onTournamentGameChange: (value: boolean) => void
  halfLengthMinutes: number
  onHalfLengthChange: (value: number) => void
  masterRoster: RosterPlayer[]
  setupLineup: SetupLineup
  firstHalfFormation: string
  onSetFirstHalfFormation: (formationId: string) => void
  onSetAttending: (id: string, attending: boolean) => void
  onSetStartFirstHalf: (id: string, starts: boolean) => void
  onSetMatchPosition: (id: string, position: string) => void
  onEditPlayer: (id: string) => void
  onStartMatch: () => void
  canStartMatch: boolean
  attendingCount: number
  lineupPresets: { id: string; preset_name: string }[]
  onLoadLineupPreset: (presetId: string) => void
  onOpenTeamManagement: () => void
  setupSlotAssignments?: Record<string, string | null>
  setupPitchKey: number
}

function SetupScreen({
  teams,
  selectedTeamId,
  onTeamChange,
  onAddTeam,
  coaches,
  selectedCoachId,
  onCoachChange,
  onAddCoach,
  rosterLoading,
  suggestedJersey,
  onAddPlayer,
  opponent,
  onOpponentChange,
  matchDate,
  onMatchDateChange,
  matchTime,
  onMatchTimeChange,
  location,
  onLocationChange,
  tournamentGame,
  onTournamentGameChange,
  halfLengthMinutes,
  onHalfLengthChange,
  masterRoster,
  setupLineup,
  firstHalfFormation,
  onSetFirstHalfFormation,
  onSetAttending,
  onSetStartFirstHalf,
  onSetMatchPosition,
  onEditPlayer,
  onStartMatch,
  canStartMatch,
  attendingCount,
  lineupPresets,
  onLoadLineupPreset,
  onOpenTeamManagement,
  setupSlotAssignments,
  setupPitchKey,
}: SetupScreenProps) {
  const [selectedPresetId, setSelectedPresetId] = useState('')

  return (
    <main className="min-h-dvh bg-background pb-10">
      <div className="mx-auto max-w-md space-y-6 px-4 pt-6">
        <header className="flex items-start justify-between gap-3">
          <div>
            <h1 className="font-display text-3xl font-bold uppercase tracking-wide text-foreground">
              Game Day Setup
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Configure match details and your 9v9 lineups before kickoff.
            </p>
          </div>
          <button
            type="button"
            onClick={onOpenTeamManagement}
            className="shrink-0 rounded-lg border border-border bg-card px-3 py-2 text-xs font-bold uppercase tracking-wide text-foreground active:scale-95"
          >
            Team Mgmt
          </button>
        </header>

        <section className="space-y-4">
          <EntitySelect
            id="team-name"
            label="Team Name"
            valueId={selectedTeamId}
            options={teams}
            addNewLabel="+ Add New Team"
            placeholder="e.g. FC Richmond"
            onChange={onTeamChange}
            onAddNew={onAddTeam}
          />

          <EntitySelect
            id="coach-name"
            label="Coach Name"
            valueId={selectedCoachId}
            options={coaches}
            addNewLabel="+ Add New Coach"
            placeholder="e.g. Coach Smith"
            onChange={onCoachChange}
            onAddNew={onAddCoach}
          />

          <div>
            <label
              htmlFor="opponent"
              className="mb-2 block text-xs font-bold uppercase tracking-widest text-muted-foreground"
            >
              Opponent Name
            </label>
            <input
              id="opponent"
              type="text"
              value={opponent}
              onChange={(e) => onOpponentChange(e.target.value)}
              placeholder="e.g. Beach FC"
              className="w-full rounded-xl border border-border bg-card px-4 py-3 text-lg font-semibold text-foreground placeholder:text-muted-foreground focus:border-neon focus:outline-none focus:ring-2 focus:ring-neon/30"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="match-date"
                className="mb-2 block text-xs font-bold uppercase tracking-widest text-muted-foreground"
              >
                Game Date
              </label>
              <input
                id="match-date"
                type="date"
                value={matchDate}
                onChange={(e) => onMatchDateChange(e.target.value)}
                className="w-full rounded-xl border border-border bg-card px-4 py-3 text-base font-semibold text-foreground focus:border-neon focus:outline-none focus:ring-2 focus:ring-neon/30"
              />
            </div>
            <div>
              <label
                htmlFor="match-time"
                className="mb-2 block text-xs font-bold uppercase tracking-widest text-muted-foreground"
              >
                Game Time
              </label>
              <input
                id="match-time"
                type="time"
                value={matchTime}
                onChange={(e) => onMatchTimeChange(e.target.value)}
                className="w-full rounded-xl border border-border bg-card px-4 py-3 text-base font-semibold tabular-nums text-foreground focus:border-neon focus:outline-none focus:ring-2 focus:ring-neon/30"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="location"
              className="mb-2 block text-xs font-bold uppercase tracking-widest text-muted-foreground"
            >
              Location
            </label>
            <input
              id="location"
              type="text"
              value={location}
              onChange={(e) => onLocationChange(e.target.value)}
              placeholder="e.g. Bryan Park Field 3"
              className="w-full rounded-xl border border-border bg-card px-4 py-3 text-lg font-semibold text-foreground placeholder:text-muted-foreground focus:border-neon focus:outline-none focus:ring-2 focus:ring-neon/30"
            />
          </div>

          <div className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3">
            <span className="text-sm font-bold text-foreground">Tournament Game</span>
            <button
              type="button"
              role="switch"
              aria-checked={tournamentGame}
              onClick={() => onTournamentGameChange(!tournamentGame)}
              className={cn(
                'relative h-8 w-14 rounded-full transition-colors',
                tournamentGame ? 'bg-neon' : 'bg-secondary',
              )}
            >
              <span
                className={cn(
                  'absolute top-1 size-6 rounded-full bg-white shadow transition-transform',
                  tournamentGame ? 'left-7' : 'left-1',
                )}
              />
            </button>
          </div>

          <div>
            <label
              htmlFor="half-length"
              className="mb-2 block text-xs font-bold uppercase tracking-widest text-muted-foreground"
            >
              Half Length (minutes)
            </label>
            <select
              id="half-length"
              value={halfLengthMinutes}
              onChange={(e) => onHalfLengthChange(Number(e.target.value))}
              className="w-full rounded-xl border border-border bg-card px-4 py-3 text-lg font-semibold text-foreground focus:border-neon focus:outline-none focus:ring-2 focus:ring-neon/30"
            >
              {HALF_LENGTH_OPTIONS.map((mins) => (
                <option key={mins} value={mins}>
                  {mins} minutes
                </option>
              ))}
            </select>
          </div>
        </section>

        <section aria-label="Lineup builder">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-2 font-display text-xl font-bold uppercase tracking-wide text-foreground">
              <Users className="size-5 text-athletic" />
              9v9 Lineup Builder
            </h2>
            <span className="rounded bg-secondary px-2 py-0.5 text-xs font-bold text-muted-foreground">
              {attendingCount} attending
            </span>
          </div>

          {!selectedTeamId ? (
            <p className="rounded-xl border border-dashed border-border bg-card px-4 py-8 text-center text-sm text-muted-foreground">
              Select a team to load its roster and build your lineup.
            </p>
          ) : rosterLoading ? (
            <p className="rounded-xl border border-border bg-card px-4 py-8 text-center text-sm text-muted-foreground">
              Loading roster…
            </p>
          ) : masterRoster.length === 0 ? (
            <>
              <p className="rounded-xl border border-dashed border-border bg-card px-4 py-8 text-center text-sm text-muted-foreground">
                No players on this team yet. Add a player below to get started.
              </p>
              <AddPlayerToRoster
                selectedTeamId={selectedTeamId}
                suggestedJersey={suggestedJersey}
                onAdd={onAddPlayer}
              />
            </>
          ) : (
            <>
              {lineupPresets.length > 0 && (
                <div>
                  <label
                    htmlFor="load-lineup-preset"
                    className="mb-2 block text-xs font-bold uppercase tracking-widest text-muted-foreground"
                  >
                    Load Lineup Preset
                  </label>
                  <select
                    id="load-lineup-preset"
                    value={selectedPresetId}
                    onChange={(e) => {
                      const presetId = e.target.value
                      setSelectedPresetId(presetId)
                      if (presetId) onLoadLineupPreset(presetId)
                    }}
                    className="w-full rounded-xl border border-border bg-card px-4 py-3 text-base font-semibold text-foreground focus:border-neon focus:outline-none focus:ring-2 focus:ring-neon/30"
                  >
                    <option value="">Choose a saved lineup…</option>
                    {lineupPresets.map((preset) => (
                      <option key={preset.id} value={preset.id}>
                        {preset.preset_name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <TacticalPitchLineup
                key={`${selectedTeamId ?? 'no-team'}-${setupPitchKey}`}
                title="1st Half Lineup"
                formationId={firstHalfFormation}
                onFormationChange={onSetFirstHalfFormation}
                initialSlotAssignments={setupSlotAssignments}
                assignmentsResetKey={setupPitchKey}
                players={masterRoster.map((player) => ({
                  id: player.id,
                  name: player.name,
                  number: player.number,
                  isGuest: player.isGuest,
                  primaryPosition: player.primaryPosition,
                  secondaryPosition: player.secondaryPosition,
                  meta: `Roster: ${player.position}`,
                }))}
                attending={setupLineup.attending}
                starters={setupLineup.startFirstHalf}
                maxFieldPlayers={MAX_FIELD_PLAYERS}
                onAssignStarter={(playerId, _role: FormationRole, tacticalPosition) => {
                  onSetStartFirstHalf(playerId, true)
                  onSetMatchPosition(playerId, tacticalPosition)
                }}
                onRemoveStarter={(playerId) => onSetStartFirstHalf(playerId, false)}
                onSetAttending={onSetAttending}
                onEditPlayer={onEditPlayer}
              />

              <AddPlayerToRoster
                selectedTeamId={selectedTeamId}
                suggestedJersey={suggestedJersey}
                onAdd={onAddPlayer}
              />
            </>
          )}
        </section>

        <button
          type="button"
          onClick={onStartMatch}
          disabled={!canStartMatch}
          className="flex w-full items-center justify-center gap-3 rounded-xl bg-neon py-8 text-neon-foreground shadow-lg shadow-neon/20 transition-transform active:scale-[0.98] active:brightness-95 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <span className="font-display text-4xl font-bold uppercase tracking-wide">Start Match</span>
        </button>
      </div>
    </main>
  )
}

type HalftimeSetupScreenProps = {
  teamName: string
  opponent: string
  seconds: number
  halfLengthMinutes: number
  players: MatchPlayer[]
  secondHalfFormation: string
  onSetSecondHalfFormation: (formationId: string) => void
  secondHalfStarters: Record<string, boolean>
  initialSlotAssignments?: Record<string, string | null>
  assignmentsResetKey: string | number
  carriedFromFirstHalf: Record<string, boolean>
  halftimeAssignmentsRef: MutableRefObject<Record<string, string | null> | null>
  onAssignSecondHalfStarter: (playerId: string, role: FormationRole, tacticalPosition: string) => void
  onRemoveSecondHalfStarter: (playerId: string) => void
  onBeginSecondHalf: () => void
  canBeginSecondHalf: boolean
}

function HalftimeSetupScreen({
  teamName,
  opponent,
  seconds,
  halfLengthMinutes,
  players,
  secondHalfFormation,
  onSetSecondHalfFormation,
  secondHalfStarters,
  initialSlotAssignments,
  assignmentsResetKey,
  carriedFromFirstHalf,
  halftimeAssignmentsRef,
  onAssignSecondHalfStarter,
  onRemoveSecondHalfStarter,
  onBeginSecondHalf,
  canBeginSecondHalf,
}: HalftimeSetupScreenProps) {
  const attendingPlayers = players.filter((p) => p.attending)

  return (
    <main className="min-h-dvh bg-background pb-10">
      <div className="mx-auto max-w-md space-y-6 px-4 pt-6">
        <header>
          <h1 className="font-display text-3xl font-bold uppercase tracking-wide text-foreground">
            Halftime Setup
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {teamName.trim() || 'Home'} vs {opponent.trim() || 'Opponent'} · 1st half ended at{' '}
            {formatClock(seconds)} / {formatClock(halfLengthMinutes * 60)}
          </p>
        </header>

        <TacticalPitchLineup
          title="2nd Half Lineup"
          formationId={secondHalfFormation}
          onFormationChange={onSetSecondHalfFormation}
          initialSlotAssignments={initialSlotAssignments}
          assignmentsResetKey={assignmentsResetKey}
          assignmentsRef={halftimeAssignmentsRef}
          players={attendingPlayers.map((player) => ({
            id: player.id,
            name: player.name,
            number: player.number,
            isGuest: player.isGuest,
            matchPosition: player.matchPosition,
            badge: carriedFromFirstHalf[player.id]
              ? player.isFirstHalfStarter
                ? 'Started 1st Half'
                : 'Carried from 1st'
              : undefined,
            meta: `${player.matchPosition} · ${formatPlayingTimeBadge(player.totalSecondsPlayed)}`,
          }))}
          attending={Object.fromEntries(attendingPlayers.map((p) => [p.id, true]))}
          starters={secondHalfStarters}
          maxFieldPlayers={MAX_FIELD_PLAYERS}
          onAssignStarter={onAssignSecondHalfStarter}
          onRemoveStarter={onRemoveSecondHalfStarter}
        />

        <button
          type="button"
          onClick={onBeginSecondHalf}
          disabled={!canBeginSecondHalf}
          className="flex w-full items-center justify-center gap-3 rounded-2xl bg-neon py-8 text-neon-foreground shadow-xl shadow-neon/30 transition-transform active:scale-[0.98] active:brightness-95 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <span className="font-display text-4xl font-black uppercase tracking-wide">
            Start 2nd Half
          </span>
        </button>
      </div>
    </main>
  )
}

/* ------------------------------------------------------------------ */
/* PlayerEditModal                                                     */
/* ------------------------------------------------------------------ */

function PlayerEditModal({
  draft,
  onChange,
  onSave,
  onClose,
}: {
  draft: PlayerEditDraft | null
  onChange: (draft: PlayerEditDraft) => void
  onSave: () => void
  onClose: () => void
}) {
  useEffect(() => {
    if (!draft) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [draft, onClose])

  if (!draft) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Edit Player"
      className="fixed inset-0 z-50 flex flex-col justify-end bg-background/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="mx-auto w-full max-w-md rounded-t-2xl border-t border-border bg-popover px-5 pb-8 pt-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-2xl font-bold uppercase text-foreground">Edit Player</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex size-11 items-center justify-center rounded-lg bg-secondary text-foreground active:scale-90"
          >
            <X className="size-6" strokeWidth={3} />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label
              htmlFor="player-name"
              className="mb-2 block text-xs font-bold uppercase tracking-widest text-muted-foreground"
            >
              Name
            </label>
            <input
              id="player-name"
              type="text"
              value={draft.name}
              onChange={(e) => onChange({ ...draft, name: e.target.value })}
              className="w-full rounded-xl border border-border bg-card px-4 py-3 text-lg font-semibold text-foreground focus:border-neon focus:outline-none focus:ring-2 focus:ring-neon/30"
            />
          </div>
          <div>
            <label
              htmlFor="player-number"
              className="mb-2 block text-xs font-bold uppercase tracking-widest text-muted-foreground"
            >
              Jersey Number
            </label>
            <input
              id="player-number"
              type="number"
              min={0}
              max={99}
              value={draft.number}
              onChange={(e) => onChange({ ...draft, number: e.target.value })}
              className="w-full rounded-xl border border-border bg-card px-4 py-3 text-lg font-semibold tabular-nums text-foreground focus:border-neon focus:outline-none focus:ring-2 focus:ring-neon/30"
            />
          </div>

          <RosterPositionFields
            idPrefix="edit-player-modal"
            primaryPosition={draft.primaryPosition}
            secondaryPosition={draft.secondaryPosition}
            onPrimaryChange={(value) => onChange({ ...draft, primaryPosition: value })}
            onSecondaryChange={(value) => onChange({ ...draft, secondaryPosition: value })}
          />

          <div className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3">
            <label htmlFor="edit-player-guest" className="text-sm font-bold text-foreground">
              Is Guest Player?
            </label>
            <button
              id="edit-player-guest"
              type="button"
              role="switch"
              aria-checked={draft.isGuest}
              onClick={() => onChange({ ...draft, isGuest: !draft.isGuest })}
              className={cn(
                'relative h-8 w-14 rounded-full transition-colors',
                draft.isGuest ? 'bg-athletic' : 'bg-secondary',
              )}
            >
              <span
                className={cn(
                  'absolute top-1 size-6 rounded-full bg-white shadow transition-transform',
                  draft.isGuest ? 'left-7' : 'left-1',
                )}
              />
            </button>
          </div>
        </div>

        <button
          type="button"
          onClick={onSave}
          disabled={!draft.name.trim()}
          className="mt-6 w-full rounded-xl bg-athletic py-4 font-display text-xl font-bold uppercase tracking-wide text-athletic-foreground active:scale-[0.98] disabled:opacity-40"
        >
          Save Player
        </button>
      </div>
    </div>
  )
}

function PeriodStartButton({
  label,
  onStart,
}: {
  label: string
  onStart: () => void
}) {
  return (
    <button
      type="button"
      onClick={onStart}
      className="w-full rounded-2xl bg-neon py-8 font-display text-4xl font-black uppercase tracking-wide text-neon-foreground shadow-xl shadow-neon/30 transition-transform active:scale-[0.98] active:brightness-95"
    >
      {label}
    </button>
  )
}

function EndPeriodButton({
  period,
  onEndFirstHalf,
  onEndGame,
}: {
  period: MatchPeriod
  onEndFirstHalf: () => void
  onEndGame: () => void
}) {
  const isFirstHalf = period === '1st'

  return (
    <button
      type="button"
      onClick={isFirstHalf ? onEndFirstHalf : onEndGame}
      className="w-full rounded-2xl bg-orange-600 py-7 font-display text-3xl font-black uppercase tracking-wider text-white shadow-xl shadow-orange-600/40 transition-transform active:scale-[0.98] active:brightness-95"
    >
      {isFirstHalf ? 'End 1st Half' : 'End of Game'}
    </button>
  )
}

function QaSpeedPanel({
  speed,
  onSpeedChange,
  expanded,
  onToggleExpanded,
}: {
  speed: QaSpeedMultiplier
  onSpeedChange: (speed: QaSpeedMultiplier) => void
  expanded: boolean
  onToggleExpanded: () => void
}) {
  return (
    <div className="fixed bottom-20 left-3 z-40">
      {expanded ? (
        <div className="rounded-lg border border-border/60 bg-card/95 p-2.5 shadow-lg backdrop-blur-sm">
          <div className="mb-2 flex items-center justify-between gap-3">
            <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              QA Test Speed
            </span>
            <button
              type="button"
              aria-label="Collapse QA panel"
              onClick={onToggleExpanded}
              className="flex size-6 items-center justify-center rounded-md bg-secondary text-muted-foreground active:scale-90"
            >
              <X className="size-3.5" strokeWidth={2.5} />
            </button>
          </div>
          <div className="flex gap-1">
            {QA_SPEED_MULTIPLIERS.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => onSpeedChange(option)}
                className={cn(
                  'min-w-[2.75rem] rounded-md px-2 py-1.5 text-xs font-bold tabular-nums transition-colors active:scale-95',
                  speed === option
                    ? 'bg-orange-600 text-white'
                    : 'bg-secondary text-muted-foreground',
                )}
              >
                {option === 1 ? '1x' : `${option}x`}
              </button>
            ))}
          </div>
          <p className="mt-2 text-[10px] leading-snug text-muted-foreground">
            {speed === 1
              ? 'Normal match speed'
              : `${speed} match seconds per real second`}
          </p>
        </div>
      ) : (
        <button
          type="button"
          onClick={onToggleExpanded}
          className={cn(
            'rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider shadow-sm backdrop-blur-sm transition-colors active:scale-95',
            speed > 1
              ? 'border-orange-500/50 bg-orange-600/20 text-orange-400'
              : 'border-border/60 bg-card/80 text-muted-foreground',
          )}
        >
          QA{speed > 1 ? ` · ${speed}x` : ''}
        </button>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* App                                                                 */
/* ------------------------------------------------------------------ */

export default function App() {
  const {
    loading,
    loadError,
    teams,
    coaches,
    masterRoster,
    appMode,
    setAppMode,
    matchId,
    players,
    setPlayers,
    homeScore,
    setHomeScore,
    awayScore,
    seconds,
    setSeconds,
    period,
    running,
    setRunning,
    periodClockStarted,
    setPeriodClockStarted,
    rosterLoading,
    selectedTeamId,
    selectTeam,
    selectedCoachId,
    setSelectedCoachId,
    matchTeamName,
    matchCoachName,
    matchOpponent,
    halfLengthMinutes,
    setHalfLengthMinutes,
    opponent,
    setOpponent,
    location,
    setLocation,
    tournamentGame,
    setTournamentGame,
    matchDate,
    setMatchDate,
    matchTime,
    setMatchTime,
    setupLineup,
    matchPositions,
    matchFormations,
    setFirstHalfFormation,
    setSecondHalfFormation,
    setActiveFormation,
    halftimeSecondHalf,
    setHalftimeStarter,
    halftimeSlotAssignments,
    secondHalfSlotAssignments,
    setSecondHalfSlotAssignments,
    carriedFromFirstHalf,
    lineupPresets,
    teamRoster,
    refreshLineupPresets,
    loadFullTeamRoster,
    applyLineupPreset,
    saveLineupPreset,
    removeLineupPreset,
    setPlayerActive,
    setupSlotAssignments,
    setupPitchKey,
    enterHalftime,
    beginSecondHalf,
    finishGame,
    returnToSetup,
    createTeam,
    createCoach,
    addPlayer,
    updatePlayer,
    beginMatch,
    endMatch,
    setPlayerAttending,
    setStartFirstHalf,
    setSetupMatchPosition,
  } = useGameDayApp()

  const suggestedJersey = nextJerseyNumber(masterRoster)

  const [toast, setToast] = useState<string | null>(null)
  const [goalWizardOpen, setGoalWizardOpen] = useState(false)
  const [goalWizardStep, setGoalWizardStep] = useState<'scorer' | 'assist'>('scorer')
  const [goalScorerId, setGoalScorerId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState<PlayerEditDraft | null>(null)
  const [startingMatch, setStartingMatch] = useState(false)
  const [qaSpeedMultiplier, setQaSpeedMultiplier] = useState<QaSpeedMultiplier>(1)
  const [qaPanelExpanded, setQaPanelExpanded] = useState(false)

  const livePitchRef = useRef<LiveTacticalPitchHandle>(null)
  const halftimeAssignmentsRef = useRef<Record<string, string | null> | null>(null)

  const clockSyncRef = useRef({ homeScore, awayScore, seconds, period, periodClockStarted })

  useEffect(() => {
    clockSyncRef.current = { homeScore, awayScore, seconds, period, periodClockStarted }
  }, [homeScore, awayScore, seconds, period, periodClockStarted])

  const attendingCount = getAttendingIds(setupLineup).length
  const canStartMatch = isSetupLineupValid(setupLineup) && Boolean(selectedTeamId)
  const canBeginSecondHalf = isHalftimeLineupValid(halftimeSecondHalf)
  const activeFormation = period === '1st' ? matchFormations.first : matchFormations.second

  useEffect(() => {
    if (appMode !== 'match' || !running || !matchId) return
    const id = setInterval(() => {
      setSeconds((s) => {
        const next = tickCountdownClock(s, qaSpeedMultiplier)
        if (next <= 0) {
          setRunning(false)
          return 0
        }
        return next
      })
    }, 1000)
    return () => clearInterval(id)
  }, [appMode, running, matchId, qaSpeedMultiplier, setSeconds, setRunning])

  useEffect(() => {
    if (appMode !== 'match' || !matchId) return
    const id = setInterval(() => {
      const clock = clockSyncRef.current
      syncMatchClock(matchId, {
        homeScore: clock.homeScore,
        awayScore: clock.awayScore,
        seconds: clock.seconds,
        period: clock.period,
        periodClockStarted: clock.periodClockStarted,
      })
    }, 5000)
    return () => clearInterval(id)
  }, [appMode, matchId])

  useEffect(() => {
    if (!toast) return
    const id = setTimeout(() => setToast(null), 2200)
    return () => clearTimeout(id)
  }, [toast])

  const handleStartMatch = useCallback(async () => {
    if (!canStartMatch || !selectedTeamId || startingMatch) return

    const team = teams.find((t) => t.id === selectedTeamId)
    const coach = selectedCoachId ? coaches.find((c) => c.id === selectedCoachId) : null
    if (!team) return

    setStartingMatch(true)
    try {
      const attendingPlayers = masterRoster.filter(
        (p) => setupLineup.attending[p.id] !== false,
      )

      await beginMatch({
        teamId: selectedTeamId,
        coachId: selectedCoachId,
        teamName: team.name,
        coachName: coach?.name ?? '',
        opponent,
        location,
        tournamentGame,
        halfLength: halfLengthMinutes,
        matchDate,
        matchTime,
        attendingPlayers,
        firstHalfStarterIds: getFirstHalfStarterIds(setupLineup),
        matchPositions,
        firstHalfFormation: matchFormations.first,
      })

      setQaSpeedMultiplier(1)
      setQaPanelExpanded(false)
      setToast('Match started')
    } catch (err) {
      setToast(formatSupabaseError(err))
    } finally {
      setStartingMatch(false)
    }
  }, [
    canStartMatch,
    selectedTeamId,
    selectedCoachId,
    startingMatch,
    teams,
    coaches,
    setupLineup,
    masterRoster,
    opponent,
    location,
    tournamentGame,
    halfLengthMinutes,
    matchDate,
    matchTime,
    matchPositions,
    matchFormations,
    beginMatch,
  ])

  const handleResetMatch = useCallback(async () => {
    if (matchId) {
      try {
        await upsertMatchStats(matchId, players)
      } catch (err) {
        console.error('[reset] failed to flush match stats', err)
      }
    }
    await endMatch()
    setGoalWizardOpen(false)
    setGoalWizardStep('scorer')
    setGoalScorerId(null)
    setQaSpeedMultiplier(1)
    setQaPanelExpanded(false)
    setToast(null)
  }, [matchId, players, endMatch])

  const handleEndGame = useCallback(async () => {
    setRunning(false)
    await finishGame(seconds)
    if (matchId) {
      syncMatchRecord(matchId, {
        period_clock_started: false,
        clock_seconds: seconds,
      })
    }
    setToast('Match complete — review your players')
  }, [seconds, matchId, finishGame, setRunning])

  const handleStartFirstHalf = useCallback(() => {
    setPlayers((prev) => {
      const stamped = stampAllOnField(prev, seconds)
      if (matchId) syncMatchStats(matchId, stamped)
      return stamped
    })
    setPeriodClockStarted(true)
    setRunning(true)
    if (matchId) {
      syncMatchRecord(matchId, {
        period_clock_started: true,
        clock_seconds: seconds,
      })
    }
    setToast(`1st half underway · ${formatClock(seconds)}`)
  }, [seconds, matchId, setPlayers, setPeriodClockStarted, setRunning])

  const handleEnterHalftime = useCallback(async () => {
    setRunning(false)
    const slotAssignments = livePitchRef.current?.getSlotAssignments()
    await enterHalftime(seconds, slotAssignments)
    if (matchId) {
      syncMatchRecord(matchId, {
        period_clock_started: false,
        clock_seconds: seconds,
      })
    }
    setToast('Halftime — 2nd half lineup carried over from the field')
  }, [seconds, matchId, enterHalftime, setRunning])

  const handleBeginSecondHalf = useCallback(async () => {
    if (!canBeginSecondHalf) return
    const assignments = halftimeAssignmentsRef.current ?? halftimeSlotAssignments
    setSecondHalfSlotAssignments(assignments)
    const newClock = halfDurationSeconds(halfLengthMinutes)
    await beginSecondHalf()
    if (matchId) {
      syncMatchRecord(matchId, {
        period: '2nd',
        clock_seconds: newClock,
        period_clock_started: true,
      })
    }
    setToast(`2nd half underway · ${formatClock(newClock)}`)
  }, [
    canBeginSecondHalf,
    halfLengthMinutes,
    matchId,
    beginSecondHalf,
    halftimeSlotAssignments,
    setSecondHalfSlotAssignments,
  ])

  const handleLoadLineupPreset = useCallback(
    (presetId: string) => {
      const preset = lineupPresets.find((p) => p.id === presetId)
      if (preset) {
        applyLineupPreset(preset)
        setToast(`Loaded preset · ${preset.preset_name}`)
      }
    },
    [lineupPresets, applyLineupPreset],
  )

  const openEditPlayer = useCallback(
    (id: string) => {
      const player = masterRoster.find((p) => p.id === id)
      if (!player) return
      setEditDraft({
        id: player.id,
        name: player.name,
        number: player.number !== null ? String(player.number) : '',
        isGuest: player.isGuest,
        primaryPosition: player.primaryPosition as RosterProfilePosition,
        secondaryPosition: player.secondaryPosition as RosterProfilePosition,
      })
    },
    [masterRoster],
  )

  const savePlayerDraft = useCallback(async () => {
    if (!editDraft) return
    const name = editDraft.name.trim()
    if (!name) return

    const jerseyRaw = editDraft.number.trim()
    let jersey: number | null = null
    if (jerseyRaw !== '') {
      const parsed = Number(jerseyRaw)
      if (Number.isNaN(parsed)) return
      jersey = parsed
    }

    try {
      await updatePlayer(editDraft.id, {
        name,
        jersey,
        isGuest: editDraft.isGuest,
        primaryPosition: editDraft.primaryPosition,
        secondaryPosition: editDraft.secondaryPosition,
      })
      setEditDraft(null)
    } catch (err) {
      setToast(err instanceof Error ? err.message : 'Failed to save player')
    }
  }, [editDraft, updatePlayer])

  const handleAddPlayer = useCallback(
    async (input: {
      name: string
      jersey: number | null
      isGuest: boolean
      primaryPosition?: string
      secondaryPosition?: string
    }) => {
      try {
        await addPlayer(input)
        const jerseyLabel = input.jersey !== null ? `#${input.jersey} ` : ''
        setToast(`Added ${jerseyLabel}${input.name}`)
      } catch (err) {
        setToast(err instanceof Error ? err.message : 'Failed to add player')
        throw err
      }
    },
    [addPlayer],
  )

  const handleLiveReassignPosition = useCallback(
    (updates: PositionReassignUpdate[]) => {
      if (!matchId || updates.length === 0) return
      const eventTimestamp = elapsedInHalf(seconds, halfLengthMinutes)

      setPlayers((prev) => {
        const next = prev.map((player) => {
          const update = updates.find((u) => u.playerId === player.id)
          return update ? { ...player, matchPosition: update.position } : player
        })

        for (const update of updates) {
          const updated = next.find((p) => p.id === update.playerId)
          if (updated) syncMatchStat(matchId, updated)
          syncMatchEvents([
            {
              matchId,
              playerId: update.playerId,
              eventType: 'position_change',
              timestamp: eventTimestamp,
              eventNotes: update.position,
              formation: activeFormation,
            },
          ])
        }

        return next
      })

      const labels = updates.map((u) => u.position).join(' · ')
      setToast(`Position · ${labels}`)
    },
    [matchId, seconds, halfLengthMinutes, activeFormation, setPlayers],
  )

  const handleLiveSubIn = useCallback(
    (benchId: string, tacticalPosition: string) => {
      if (!matchId) return
      const onFieldCount = players.filter((p) => p.attending && p.isOnField).length
      if (onFieldCount >= MAX_FIELD_PLAYERS) return

      const eventTimestamp = elapsedInHalf(seconds, halfLengthMinutes)

      setPlayers((prev) => {
        const next = applySubIn(prev, benchId, seconds).map((p) =>
          p.id === benchId ? { ...p, matchPosition: tacticalPosition } : p,
        )
        const benchPlayer = next.find((p) => p.id === benchId)
        if (benchPlayer) {
          syncMatchStat(matchId, benchPlayer)
          syncMatchEvents([
            {
              matchId,
              playerId: benchPlayer.id,
              eventType: 'sub_in',
              timestamp: eventTimestamp,
              formation: activeFormation,
            },
          ])
          setToast(
            `Sub in · ${benchPlayer.number !== null ? `#${benchPlayer.number} ` : ''}${benchPlayer.name}`,
          )
        }
        return next
      })
    },
    [matchId, players, seconds, halfLengthMinutes, activeFormation, setPlayers],
  )

  const handleLiveSubOut = useCallback(
    (fieldId: string) => {
      if (!matchId) return
      const eventTimestamp = elapsedInHalf(seconds, halfLengthMinutes)

      setPlayers((prev) => {
        const next = applySubOut(prev, fieldId, seconds)
        const fieldPlayer = next.find((p) => p.id === fieldId)
        if (fieldPlayer) {
          syncMatchStat(matchId, fieldPlayer)
          syncMatchEvents([
            {
              matchId,
              playerId: fieldPlayer.id,
              eventType: 'sub_out',
              timestamp: eventTimestamp,
              formation: activeFormation,
            },
          ])
          setToast(
            `Sub out · ${fieldPlayer.number !== null ? `#${fieldPlayer.number} ` : ''}${fieldPlayer.name}`,
          )
        }
        return next
      })
    },
    [matchId, seconds, halfLengthMinutes, activeFormation, setPlayers],
  )

  const handleLiveSwap = useCallback(
    (benchId: string, fieldId: string, tacticalPosition: string) => {
      if (!matchId) return
      const eventTimestamp = elapsedInHalf(seconds, halfLengthMinutes)

      setPlayers((prev) => {
        const next = applySubstitution(prev, benchId, fieldId, seconds).map((p) =>
          p.id === benchId ? { ...p, matchPosition: tacticalPosition } : p,
        )
        const benchPlayer = next.find((p) => p.id === benchId)
        const fieldPlayer = next.find((p) => p.id === fieldId)

        if (benchPlayer && fieldPlayer) {
          syncMatchStat(matchId, benchPlayer)
          syncMatchStat(matchId, fieldPlayer)
          syncMatchEvents([
            {
              matchId,
              playerId: fieldPlayer.id,
              eventType: 'sub_out',
              timestamp: eventTimestamp,
              formation: activeFormation,
            },
            {
              matchId,
              playerId: benchPlayer.id,
              eventType: 'sub_in',
              timestamp: eventTimestamp,
              formation: activeFormation,
            },
          ])
          setToast(
            `Sub · ${benchPlayer.number !== null ? `#${benchPlayer.number} ` : ''}${benchPlayer.name} for ${fieldPlayer.number !== null ? `#${fieldPlayer.number} ` : ''}${fieldPlayer.name}`,
          )
        }
        return next
      })
    },
    [matchId, seconds, halfLengthMinutes, activeFormation, setPlayers],
  )

  const closeGoalWizard = useCallback(() => {
    setGoalWizardOpen(false)
    setGoalWizardStep('scorer')
    setGoalScorerId(null)
  }, [])

  const handleSelectGoalScorer = useCallback((player: MatchPlayer) => {
    setGoalScorerId(player.id)
    setGoalWizardStep('assist')
  }, [])

  const handleCompleteGoal = useCallback(
    (assistPlayerId: string | null) => {
      if (!matchId || !goalScorerId) return

      const scorer = players.find((p) => p.id === goalScorerId)
      if (!scorer) return

      if (assistPlayerId === goalScorerId) return

      const eventTimestamp = elapsedInHalf(seconds, halfLengthMinutes)

      setHomeScore((s) => {
        const next = s + 1
        syncMatchRecord(matchId, { home_score: next })
        return next
      })

      syncMatchEvent({
        matchId,
        playerId: goalScorerId,
        eventType: 'goal',
        timestamp: eventTimestamp,
        formation: activeFormation,
        assistPlayerId,
      })

      const assistPlayer = assistPlayerId
        ? players.find((p) => p.id === assistPlayerId)
        : null
      const scorerLabel = `${scorer.number !== null ? `#${scorer.number} ` : ''}${scorer.name}`
      const assistLabel = assistPlayer
        ? `${assistPlayer.number !== null ? `#${assistPlayer.number} ` : ''}${assistPlayer.name}`
        : 'Unassisted'

      setToast(`Goal · ${scorerLabel} (${assistLabel})`)
      closeGoalWizard()
    },
    [
      matchId,
      goalScorerId,
      players,
      seconds,
      halfLengthMinutes,
      activeFormation,
      setHomeScore,
      closeGoalWizard,
    ],
  )

  if (loading) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-background px-4">
        <p className="text-sm font-semibold text-muted-foreground">Loading from Supabase…</p>
      </main>
    )
  }

  if (loadError) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-background px-4">
        <div className="max-w-md rounded-xl border border-danger/40 bg-card p-6 text-center">
          <p className="font-bold text-danger">Failed to connect</p>
          <p className="mt-2 text-sm text-muted-foreground">{loadError}</p>
        </div>
      </main>
    )
  }

  if (appMode === 'setup') {
    return (
      <>
        <SetupScreen
          teams={teams}
          selectedTeamId={selectedTeamId}
          onTeamChange={selectTeam}
          onAddTeam={async (name) => createTeam(name)}
          coaches={coaches}
          selectedCoachId={selectedCoachId}
          onCoachChange={setSelectedCoachId}
          onAddCoach={async (name) => {
            await createCoach(name)
          }}
          rosterLoading={rosterLoading}
          suggestedJersey={suggestedJersey}
          onAddPlayer={handleAddPlayer}
          opponent={opponent}
          onOpponentChange={setOpponent}
          matchDate={matchDate}
          onMatchDateChange={setMatchDate}
          matchTime={matchTime}
          onMatchTimeChange={setMatchTime}
          location={location}
          onLocationChange={setLocation}
          tournamentGame={tournamentGame}
          onTournamentGameChange={setTournamentGame}
          halfLengthMinutes={halfLengthMinutes}
          onHalfLengthChange={setHalfLengthMinutes}
          masterRoster={masterRoster}
          setupLineup={setupLineup}
          firstHalfFormation={matchFormations.first}
          onSetFirstHalfFormation={setFirstHalfFormation}
          onSetAttending={setPlayerAttending}
          onSetStartFirstHalf={setStartFirstHalf}
          onSetMatchPosition={setSetupMatchPosition}
          onEditPlayer={openEditPlayer}
          onStartMatch={() => void handleStartMatch()}
          canStartMatch={canStartMatch && !startingMatch}
          attendingCount={attendingCount}
          lineupPresets={lineupPresets}
          onLoadLineupPreset={handleLoadLineupPreset}
          onOpenTeamManagement={() => setAppMode('team')}
          setupSlotAssignments={setupSlotAssignments}
          setupPitchKey={setupPitchKey}
        />
        <PlayerEditModal
          draft={editDraft}
          onChange={setEditDraft}
          onSave={() => void savePlayerDraft()}
          onClose={() => setEditDraft(null)}
        />
      </>
    )
  }

  if (appMode === 'team') {
    return (
      <>
        <TeamManagementScreen
          teams={teams.map((t) => ({ id: t.id, name: t.name }))}
          selectedTeamId={selectedTeamId}
          onTeamChange={selectTeam}
          rosterLoading={rosterLoading}
          teamRoster={teamRoster}
          suggestedJersey={suggestedJersey}
          lineupPresets={lineupPresets}
          onRefreshPresets={refreshLineupPresets}
          onRefreshRoster={loadFullTeamRoster}
          onAddPlayer={addPlayer}
          onUpdatePlayer={updatePlayer}
          onSetPlayerActive={setPlayerActive}
          onSavePreset={saveLineupPreset}
          onDeletePreset={removeLineupPreset}
          onBack={() => setAppMode('setup')}
          onToast={setToast}
        />
        {toast && (
          <div className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-4">
            <div className="flex items-center gap-2 rounded-full bg-neon px-4 py-2.5 text-sm font-bold text-neon-foreground shadow-lg">
              <CheckCircle2 className="size-5" strokeWidth={2.5} />
              {toast}
            </div>
          </div>
        )}
      </>
    )
  }

  if (appMode === 'halftime') {
    return (
      <>
        <HalftimeSetupScreen
          teamName={matchTeamName}
          opponent={matchOpponent}
          seconds={seconds}
          halfLengthMinutes={halfLengthMinutes}
          players={players}
          secondHalfFormation={matchFormations.second}
          onSetSecondHalfFormation={setSecondHalfFormation}
          secondHalfStarters={halftimeSecondHalf}
          initialSlotAssignments={halftimeSlotAssignments}
          assignmentsResetKey={`halftime-${matchId ?? 'local'}`}
          carriedFromFirstHalf={carriedFromFirstHalf}
          halftimeAssignmentsRef={halftimeAssignmentsRef}
          onAssignSecondHalfStarter={(playerId, _role, tacticalPosition) => {
            setHalftimeStarter(playerId, true)
            setPlayers((prev) =>
              prev.map((p) =>
                p.id === playerId ? { ...p, matchPosition: tacticalPosition } : p,
              ),
            )
          }}
          onRemoveSecondHalfStarter={(playerId) => setHalftimeStarter(playerId, false)}
          onBeginSecondHalf={() => void handleBeginSecondHalf()}
          canBeginSecondHalf={canBeginSecondHalf}
        />
        {toast && (
          <div className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-4">
            <div className="flex items-center gap-2 rounded-full bg-neon px-4 py-2.5 text-sm font-bold text-neon-foreground shadow-lg">
              <CheckCircle2 className="size-5" strokeWidth={2.5} />
              {toast}
            </div>
          </div>
        )}
      </>
    )
  }

  if (appMode === 'recap' && matchId) {
    return (
      <>
        <PostGameRecap
          matchId={matchId}
          teamName={matchTeamName}
          opponent={matchOpponent}
          homeScore={homeScore}
          awayScore={awayScore}
          halfLengthMinutes={halfLengthMinutes}
          players={players}
          onFinalize={() => returnToSetup()}
          onToast={setToast}
        />
        {toast && (
          <div className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-4">
            <div className="flex items-center gap-2 rounded-full bg-neon px-4 py-2.5 text-sm font-bold text-neon-foreground shadow-lg">
              <CheckCircle2 className="size-5" strokeWidth={2.5} />
              {toast}
            </div>
          </div>
        )}
      </>
    )
  }

  return (
    <main className="min-h-dvh bg-background pb-10">
      <QaSpeedPanel
        speed={qaSpeedMultiplier}
        onSpeedChange={setQaSpeedMultiplier}
        expanded={qaPanelExpanded}
        onToggleExpanded={() => setQaPanelExpanded((v) => !v)}
      />

      <MatchHeader
        teamName={matchTeamName}
        coachName={matchCoachName}
        opponent={matchOpponent}
        homeScore={homeScore}
        awayScore={awayScore}
        seconds={seconds}
        period={period}
        halfLengthMinutes={halfLengthMinutes}
        running={running}
        periodClockStarted={periodClockStarted}
      />

      <div className="mx-auto max-w-md space-y-6 px-4 pt-5">
        {!periodClockStarted && period === '1st' && (
          <PeriodStartButton label="Start 1st Half" onStart={handleStartFirstHalf} />
        )}

        {periodClockStarted && (
          <EndPeriodButton
            period={period}
            onEndFirstHalf={() => void handleEnterHalftime()}
            onEndGame={() => void handleEndGame()}
          />
        )}

        {periodClockStarted && (
          <button
            type="button"
            onClick={() => setGoalWizardOpen(true)}
            className="flex w-full items-center justify-center gap-3 rounded-2xl bg-neon py-6 font-display text-4xl font-black uppercase tracking-wide text-neon-foreground shadow-xl shadow-neon/30 transition-transform active:scale-[0.98] active:brightness-95"
          >
            <Goal className="size-10" strokeWidth={2.5} />
            Goal
          </button>
        )}

        <LiveTacticalPitch
          ref={livePitchRef}
          key={period}
          periodKey={period}
          formationId={activeFormation}
          onFormationChange={setActiveFormation}
          players={players}
          clockSeconds={seconds}
          maxFieldPlayers={MAX_FIELD_PLAYERS}
          initialSlotAssignments={period === '2nd' ? secondHalfSlotAssignments : undefined}
          onSwap={handleLiveSwap}
          onSubIn={handleLiveSubIn}
          onSubOut={handleLiveSubOut}
          onReassignPosition={handleLiveReassignPosition}
        />

        <div className="pt-2">
          <button
            type="button"
            onClick={() => void handleResetMatch()}
            className="w-full py-3 text-sm font-bold uppercase tracking-widest text-danger transition-opacity active:opacity-70"
          >
            Reset Match
          </button>
        </div>
      </div>

      <GoalWizardModal
        open={goalWizardOpen}
        step={goalWizardStep}
        players={players}
        scorerId={goalScorerId}
        onSelectScorer={handleSelectGoalScorer}
        onSelectAssist={handleCompleteGoal}
        onClose={closeGoalWizard}
      />

      {toast && (
        <div className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-4">
          <div className="flex items-center gap-2 rounded-full bg-neon px-4 py-2.5 text-sm font-bold text-neon-foreground shadow-lg">
            <CheckCircle2 className="size-5" strokeWidth={2.5} />
            {toast}
          </div>
        </div>
      )}
    </main>
  )
}
