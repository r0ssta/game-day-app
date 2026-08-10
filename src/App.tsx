import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type MutableRefObject, type ReactNode } from 'react'
import {
  CheckCircle2,
  Goal,
  Share2,
  Shield,
  UserPlus,
  Users,
  X,
} from 'lucide-react'
import { DeleteMatchConfirmModal } from '@/components/DeleteMatchConfirmModal'
import { GoalWizardModal } from '@/components/GoalWizardModal'
import { SidelineStatsPanel } from '@/components/SidelineStatsPanel'
import { HomeScreen } from '@/components/HomeScreen'
import { ReportingScreen } from '@/components/ReportingScreen'
import { BackToHomeButton, ScreenHeader } from '@/components/AppNavigation'
import {
  AppNavDrawer,
  AppNavShell,
  buildAppNavItems,
  resolveActiveNavSection,
  type AppNavSection,
} from '@/components/AppNavDrawer'
import { GlobalTeamSelector } from '@/components/GlobalTeamSelector'
import { teamsForSelector } from '@/lib/team-context'
import type { ReportingTab } from '@/components/reporting/ReportingTabBar'
import { TeamManagementScreen } from '@/components/TeamManagementScreen'
import {
  LiveTacticalPitch,
  type LiveTacticalPitchHandle,
  type PositionReassignUpdate,
} from '@/components/LiveTacticalPitch'
import { PostGameRecap } from '@/components/PostGameRecap'
import { MatchRecapHistoryScreen } from '@/components/MatchRecapHistoryScreen'
import {
  DEFAULT_PRIMARY_POSITION,
  DEFAULT_SECONDARY_POSITION,
  RosterPositionFields,
} from '@/components/RosterPositionFields'
import { TacticalPitchLineup } from '@/components/TacticalPitchLineup'
import { useGameDayApp } from '@/hooks/useGameDayApp'
import type { FormationRole, FormationRemapResult } from '@/lib/formations'
import { getFormationLabel, matchPositionsFromSlotAssignments } from '@/lib/formations'
import {
  getAttendingIds,
  getFirstHalfStarterIds,
  getMaxFieldPlayers,
  getSetupLineupBlockReason,
  isHalftimeLineupValid,
} from '@/lib/lineup'
import { resolveSetupLineup } from '@/lib/lineup-presets'
import type { TeamFormat } from '@/lib/team-format'
import {
  applySubIn,
  applySubOut,
  applySubstitution,
  formatPlayingTimeBadge,
  stampAllOnField,
} from '@/lib/play-time'
import { elapsedInHalf, halfDurationSeconds, isHalfExpired, QA_SPEED_MULTIPLIERS, tickCountdownClock, type QaSpeedMultiplier } from '@/lib/match-clock'
import type { RosterProfilePosition } from '@/lib/positions'
import { applyPlusMinusDelta } from '@/lib/plus-minus'
import { buildStatTrackerUrl } from '@/lib/stat-tracker'
import {
  syncMatchClock,
  syncMatchEvent,
  syncMatchEvents,
  syncMatchRecord,
  syncMatchStat,
  syncMatchStats,
  ensureStatTrackerToken,
  formatSupabaseError,
  fetchPendingReviewMatchesByTeamId,
} from '@/lib/supabase-api'
import { cn } from '@/lib/utils'
import { APP_CONTAINER, APP_SHELL, MODAL_OVERLAY, MODAL_PANEL, TOUCH_ICON_BUTTON } from '@/lib/layout'
import type { DbMatch } from '@/types/database'
import {
  buildSidelineNameMap,
  formatPlayerFullName,
  formatPlayerLabel,
  getSidelineName,
} from '@/lib/player-names'
import type {
  MatchPeriod,
  MatchPlayer,
  RosterPlayer,
  SetupLineup,
} from '@/types/match'
import type { LocationType } from '@/lib/match-location'
import { formatVenueLabel } from '@/lib/match-location'


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

function CoachNameField({
  id,
  label,
  value,
  suggestions,
  onChange,
}: {
  id: string
  label: string
  value: string
  suggestions: string[]
  onChange: (value: string) => void
}) {
  const listId = `${id}-suggestions`

  return (
    <div>
      <label
        htmlFor={id}
        className="mb-2 block text-xs font-bold uppercase tracking-widest text-muted-foreground"
      >
        {label}
      </label>
      <input
        id={id}
        type="text"
        list={listId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="e.g. Coach Smith"
        className="w-full rounded-xl border border-border bg-card px-4 py-3 text-lg font-semibold text-foreground placeholder:text-muted-foreground focus:border-neon focus:outline-none focus:ring-2 focus:ring-neon/30"
      />
      <datalist id={listId}>
        {suggestions.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>
    </div>
  )
}

function HomeAwayToggle({
  value,
  onChange,
}: {
  value: LocationType
  onChange: (value: LocationType) => void
}) {
  return (
    <div>
      <span className="mb-2 block text-xs font-bold uppercase tracking-widest text-muted-foreground">
        Home / Away
      </span>
      <div
        role="group"
        aria-label="Home or Away"
        className="grid grid-cols-2 gap-1 rounded-xl border border-border bg-card p-1"
      >
        {(['home', 'away'] as const).map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={value === option}
            onClick={() => onChange(option)}
            className={cn(
              'rounded-lg py-3 text-sm font-bold uppercase tracking-wide transition-colors active:scale-[0.98]',
              value === option
                ? option === 'home'
                  ? 'bg-neon text-neon-foreground shadow-sm'
                  : 'bg-athletic text-athletic-foreground shadow-sm'
                : 'text-muted-foreground',
            )}
          >
            {formatVenueLabel(option)}
          </button>
        ))}
      </div>
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
  qaSpeed: QaSpeedMultiplier
  onQaSpeedChange: (speed: QaSpeedMultiplier) => void
  onHome: () => void
}

function QaSpeedControls({
  speed,
  onSpeedChange,
}: {
  speed: QaSpeedMultiplier
  onSpeedChange: (speed: QaSpeedMultiplier) => void
}) {
  return (
    <div className="mt-3 w-full max-w-sm rounded-xl border-2 border-orange-500/40 bg-orange-600/10 px-3 py-3 shadow-inner">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-[11px] font-black uppercase tracking-widest text-orange-400">
          QA Test Speed
        </span>
        <span className="text-[10px] font-semibold text-orange-300/80">
          {speed === 1 ? 'Normal' : `${speed} sec / real sec`}
        </span>
      </div>
      <div
        className="grid grid-cols-3 gap-2"
        role="group"
        aria-label="QA match clock speed"
      >
        {QA_SPEED_MULTIPLIERS.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => onSpeedChange(option)}
            aria-pressed={speed === option}
            className={cn(
              'min-h-11 touch-manipulation rounded-lg px-3 py-2.5 text-sm font-black tabular-nums uppercase tracking-wide transition-all active:scale-[0.97]',
              speed === option
                ? 'bg-orange-600 text-white shadow-md shadow-orange-600/30 ring-2 ring-orange-400/60'
                : 'border border-orange-500/30 bg-background/80 text-orange-200 hover:bg-orange-600/20',
            )}
          >
            {option}x
          </button>
        ))}
      </div>
    </div>
  )
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
  qaSpeed,
  onQaSpeedChange,
  onHome,
}: MatchHeaderProps) {
  const homeLabel = teamName.trim() || 'Home'
  const awayName = opponent.trim() || 'Opponent'
  const halfReference = formatClock(halfDurationSeconds(halfLengthMinutes))
  const coachLine = coachName.trim() ? `Coach: ${coachName.trim()}` : null
  const halfEnded = periodClockStarted && isHalfExpired(seconds)
  const waitingToStart = !periodClockStarted

  return (
    <header className="sticky top-14 z-30 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className={`${APP_CONTAINER} pb-4 pt-3`}>
        <div className="mb-2 flex justify-end">
          <BackToHomeButton onClick={onHome} />
        </div>
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
          {coachLine ?? `${homeLabel} vs ${awayName}`}
        </p>

        <div className="mt-3 flex items-center justify-center gap-5">
          <div className="min-w-[4.5rem] text-center">
            <p className="text-[10px] font-bold uppercase tracking-widest text-neon">{homeLabel}</p>
            <p className="font-display text-4xl font-black tabular-nums leading-none text-neon">
              {homeScore}
            </p>
          </div>
          <span className="font-display text-2xl font-bold text-muted-foreground">–</span>
          <div className="min-w-[4.5rem] text-center">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              {awayName}
            </p>
            <p className="font-display text-4xl font-black tabular-nums leading-none text-foreground">
              {awayScore}
            </p>
          </div>
        </div>

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
          <QaSpeedControls speed={qaSpeed} onSpeedChange={onQaSpeedChange} />
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
  firstName: string
  lastName: string
  number: string
  isGuest: boolean
  primaryPosition: RosterProfilePosition
  secondaryPosition: RosterProfilePosition
}

type AddPlayerToRosterProps = {
  selectedTeamId: string | null
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

function AddPlayerToRoster({ selectedTeamId, suggestedJersey, onAdd }: AddPlayerToRosterProps) {
  const [expanded, setExpanded] = useState(false)
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [number, setNumber] = useState('')
  const [isGuest, setIsGuest] = useState(false)
  const [primaryPosition, setPrimaryPosition] = useState<RosterProfilePosition>(DEFAULT_PRIMARY_POSITION)
  const [secondaryPosition, setSecondaryPosition] =
    useState<RosterProfilePosition>(DEFAULT_SECONDARY_POSITION)
  const [saving, setSaving] = useState(false)

  const teamSelected = Boolean(selectedTeamId)
  const canSubmit =
    teamSelected && firstName.trim().length > 0 && lastName.trim().length > 0 && !saving

  const resetForm = () => {
    setFirstName('')
    setLastName('')
    setIsGuest(false)
    setNumber('')
    setPrimaryPosition(DEFAULT_PRIMARY_POSITION)
    setSecondaryPosition(DEFAULT_SECONDARY_POSITION)
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!canSubmit || !selectedTeamId) return

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
  activeTeamId: string | null
  activeTeamName: string
  activeTeamFormat: TeamFormat
  teamSwitcher: ReactNode
  coachName: string
  onCoachNameChange: (value: string) => void
  coachSuggestions: string[]
  rosterLoading: boolean
  suggestedJersey: number
  onAddPlayer: (input: {
    firstName: string
    lastName: string
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
  locationType: LocationType
  onLocationTypeChange: (value: LocationType) => void
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
  startMatchBlockReason: string | null
  attendingCount: number
  lineupPresets: { id: string; preset_name: string }[]
  onLoadLineupPreset: (presetId: string) => void
  onBackToHome: () => void
  setupSlotAssignments?: Record<string, string | null>
  setupPitchKey: number
  setupAssignmentsRef: MutableRefObject<Record<string, string | null> | null>
}

function SetupScreen({
  activeTeamId,
  activeTeamName,
  activeTeamFormat,
  teamSwitcher,
  coachName,
  onCoachNameChange,
  coachSuggestions,
  rosterLoading,
  suggestedJersey,
  onAddPlayer,
  opponent,
  onOpponentChange,
  matchDate,
  onMatchDateChange,
  matchTime,
  onMatchTimeChange,
  locationType,
  onLocationTypeChange,
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
  startMatchBlockReason,
  attendingCount,
  lineupPresets,
  onLoadLineupPreset,
  onBackToHome,
  setupSlotAssignments,
  setupPitchKey,
  setupAssignmentsRef,
}: SetupScreenProps) {
  const [selectedPresetId, setSelectedPresetId] = useState('')
  const maxFieldPlayers = getMaxFieldPlayers(activeTeamFormat)

  const attendingRoster = useMemo(
    () => masterRoster.filter((player) => setupLineup.attending[player.id]),
    [masterRoster, setupLineup.attending],
  )
  const sidelineNameMap = useMemo(
    () => buildSidelineNameMap(attendingRoster),
    [attendingRoster],
  )

  return (
    <main className={`${APP_SHELL} pb-10 md:pb-12`}>
      <div className={`${APP_CONTAINER} space-y-6 pt-6 md:space-y-8 md:pt-8`}>
        <ScreenHeader
          title="Game Day Setup"
          subtitle={`Pre-game lineup and match details for ${activeTeamName}.`}
          onHome={onBackToHome}
          teamSwitcher={teamSwitcher}
        />

        <section className="space-y-4">
          <p className="rounded-xl border border-neon/30 bg-neon/5 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {activeTeamFormat} format · {maxFieldPlayers} on field
          </p>

          <CoachNameField
            id="head-coach"
            label="Head Coach"
            value={coachName}
            suggestions={coachSuggestions}
            onChange={onCoachNameChange}
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

          <HomeAwayToggle value={locationType} onChange={onLocationTypeChange} />

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
              {activeTeamFormat} Lineup Builder
            </h2>
            <span className="rounded bg-secondary px-2 py-0.5 text-xs font-bold text-muted-foreground">
              {attendingCount} attending
            </span>
          </div>

          {rosterLoading ? (
            <p className="rounded-xl border border-border bg-card px-4 py-8 text-center text-sm text-muted-foreground">
              Loading roster…
            </p>
          ) : masterRoster.length === 0 ? (
            <>
              <p className="rounded-xl border border-dashed border-border bg-card px-4 py-8 text-center text-sm text-muted-foreground">
                No players on this team yet. Add a player below to get started.
              </p>
              <AddPlayerToRoster
                selectedTeamId={activeTeamId}
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
                key={`${activeTeamId ?? 'no-team'}-${setupPitchKey}`}
                title="1st Half Lineup"
                formationId={firstHalfFormation}
                onFormationChange={onSetFirstHalfFormation}
                initialSlotAssignments={setupSlotAssignments}
                assignmentsResetKey={setupPitchKey}
                assignmentsRef={setupAssignmentsRef}
                players={masterRoster.map((player) => ({
                  id: player.id,
                  name: formatPlayerFullName(player.firstName, player.lastName),
                  shortName: setupLineup.attending[player.id]
                    ? getSidelineName(player, sidelineNameMap)
                    : formatPlayerFullName(player.firstName, player.lastName),
                  number: player.number,
                  isGuest: player.isGuest,
                  primaryPosition: player.primaryPosition,
                  secondaryPosition: player.secondaryPosition,
                  meta: `Roster: ${player.position}`,
                }))}
                attending={setupLineup.attending}
                starters={setupLineup.startFirstHalf}
                maxFieldPlayers={maxFieldPlayers}
                teamFormat={activeTeamFormat}
                onAssignStarter={(playerId, _role: FormationRole, tacticalPosition) => {
                  onSetStartFirstHalf(playerId, true)
                  onSetMatchPosition(playerId, tacticalPosition)
                }}
                onRemoveStarter={(playerId) => onSetStartFirstHalf(playerId, false)}
                onSetAttending={onSetAttending}
                onEditPlayer={onEditPlayer}
              />

              <AddPlayerToRoster
                selectedTeamId={activeTeamId}
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
          <span className="font-display text-3xl font-bold uppercase tracking-wide sm:text-4xl">
            Ready for 1st Half
          </span>
        </button>
        {!canStartMatch && startMatchBlockReason ? (
          <p className="text-center text-sm font-semibold text-muted-foreground">
            {startMatchBlockReason}
          </p>
        ) : null}
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
  lineupPresets: { id: string; preset_name: string }[]
  onLoadLineupPreset: (presetId: string) => void
  onAssignSecondHalfStarter: (playerId: string, role: FormationRole, tacticalPosition: string) => void
  onRemoveSecondHalfStarter: (playerId: string) => void
  onBeginSecondHalf: () => void
  canBeginSecondHalf: boolean
  onBackToHome: () => void
  activeTeamFormat: TeamFormat
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
  lineupPresets,
  onLoadLineupPreset,
  onAssignSecondHalfStarter,
  onRemoveSecondHalfStarter,
  onBeginSecondHalf,
  canBeginSecondHalf,
  onBackToHome,
  activeTeamFormat,
}: HalftimeSetupScreenProps) {
  const [selectedPresetId, setSelectedPresetId] = useState('')
  const maxFieldPlayers = getMaxFieldPlayers(activeTeamFormat)
  const attendingPlayers = players.filter((p) => p.attending)
  const sidelineNameMap = useMemo(
    () => buildSidelineNameMap(attendingPlayers),
    [attendingPlayers],
  )

  return (
    <main className={`${APP_SHELL} pb-10 md:pb-12`}>
      <div className={`${APP_CONTAINER} space-y-6 pt-6 md:space-y-8 md:pt-8`}>
        <ScreenHeader
          title="Halftime Setup"
          subtitle={`${teamName.trim() || 'Home'} vs ${opponent.trim() || 'Opponent'} · 1st half ended at ${formatClock(seconds)} / ${formatClock(halfLengthMinutes * 60)}`}
          onHome={onBackToHome}
        />

        {lineupPresets.length > 0 ? (
          <div>
            <label
              htmlFor="load-halftime-preset"
              className="mb-2 block text-xs font-bold uppercase tracking-widest text-muted-foreground"
            >
              Load Lineup Preset
            </label>
            <select
              id="load-halftime-preset"
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
        ) : null}

        <TacticalPitchLineup
          title="2nd Half Lineup"
          formationId={secondHalfFormation}
          onFormationChange={onSetSecondHalfFormation}
          initialSlotAssignments={initialSlotAssignments}
          assignmentsResetKey={assignmentsResetKey}
          assignmentsRef={halftimeAssignmentsRef}
          players={attendingPlayers.map((player) => ({
            id: player.id,
            name: formatPlayerFullName(player.firstName, player.lastName),
            shortName: getSidelineName(player, sidelineNameMap),
            number: player.number,
            isGuest: player.isGuest,
            matchPosition: player.matchPosition,
            minutesLabel: formatPlayingTimeBadge(player.totalSecondsPlayed),
            badge: carriedFromFirstHalf[player.id]
              ? player.isFirstHalfStarter
                ? 'Started 1st Half'
                : 'Carried from 1st'
              : undefined,
            meta: player.matchPosition,
          }))}
          attending={Object.fromEntries(attendingPlayers.map((p) => [p.id, true]))}
          starters={secondHalfStarters}
          maxFieldPlayers={maxFieldPlayers}
          teamFormat={activeTeamFormat}
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
      className={MODAL_OVERLAY}
      onClick={onClose}
    >
      <div
        className={cn(MODAL_PANEL, 'min-h-0')}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between px-5 pb-3 pt-4">
          <h2 className="font-display text-2xl font-bold uppercase text-foreground">Edit Player</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className={`${TOUCH_ICON_BUTTON} bg-secondary text-foreground`}
          >
            <X className="size-6" strokeWidth={3} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-8">
          <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="player-first-name"
                className="mb-2 block text-xs font-bold uppercase tracking-widest text-muted-foreground"
              >
                First Name
              </label>
              <input
                id="player-first-name"
                type="text"
                required
                value={draft.firstName}
                onChange={(e) => onChange({ ...draft, firstName: e.target.value })}
                className="w-full rounded-xl border border-border bg-card px-4 py-3 text-lg font-semibold text-foreground focus:border-neon focus:outline-none focus:ring-2 focus:ring-neon/30"
              />
            </div>
            <div>
              <label
                htmlFor="player-last-name"
                className="mb-2 block text-xs font-bold uppercase tracking-widest text-muted-foreground"
              >
                Last Name
              </label>
              <input
                id="player-last-name"
                type="text"
                required
                value={draft.lastName}
                onChange={(e) => onChange({ ...draft, lastName: e.target.value })}
                className="w-full rounded-xl border border-border bg-card px-4 py-3 text-lg font-semibold text-foreground focus:border-neon focus:outline-none focus:ring-2 focus:ring-neon/30"
              />
            </div>
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
            disabled={!draft.firstName.trim() || !draft.lastName.trim()}
            className="mt-6 min-h-11 w-full touch-manipulation rounded-xl bg-athletic py-4 font-display text-xl font-bold uppercase tracking-wide text-athletic-foreground active:scale-[0.98] disabled:opacity-40"
          >
            Save Player
          </button>
        </div>
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
    setAwayScore,
    seconds,
    setSeconds,
    period,
    running,
    setRunning,
    periodClockStarted,
    setPeriodClockStarted,
    rosterLoading,
    activeTeamId,
    setActiveTeamId,
    activeTeamFormat,
    updateTeamFormat,
    updateTeamPrimaryCoach,
    activeTeamPrimaryCoachName,
    setupCoachName,
    setSetupCoachName,
    matchTeamName,
    matchCoachName,
    matchOpponent,
    matchLocationType,
    halfLengthMinutes,
    setHalfLengthMinutes,
    opponent,
    setOpponent,
    locationType,
    setLocationType,
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
    carriedFromFirstHalf,
    lineupPresets,
    teamRoster,
    refreshLineupPresets,
    loadFullTeamRoster,
    applyLineupPreset,
    applyHalftimeLineupPreset,
    saveLineupPreset,
    removeLineupPreset,
    setPlayerActive,
    setupSlotAssignments,
    setupPitchKey,
    halftimePitchKey,
    enterHalftime,
    beginSecondHalf,
    finishGame,
    returnToHome,
    openMatchRecap,
    matchStatus,
    hasLiveMatch,
    hasPendingRecap,
    createTeam,
    addPlayer,
    updatePlayer,
    beginMatch,
    setPlayerAttending,
    setStartFirstHalf,
    setSetupMatchPosition,
    scheduledMatches,
    scheduledLoading,
    refreshScheduledMatches,
    createScheduledMatch,
    removeScheduledMatch,
    loadScheduledMatchIntoSetup,
    deleteMatch,
  } = useGameDayApp()

  const coachSuggestions = useMemo(
    () => coaches.map((coach) => coach.name).sort((a, b) => a.localeCompare(b)),
    [coaches],
  )

  const suggestedJersey = nextJerseyNumber(masterRoster)

  const [toast, setToast] = useState<string | null>(null)
  const [pendingReviewMatches, setPendingReviewMatches] = useState<DbMatch[]>([])
  const [recapReturnMode, setRecapReturnMode] = useState<
    'home' | 'recap_history' | 'reporting' | null
  >(null)
  const [goalWizardOpen, setGoalWizardOpen] = useState(false)
  const [goalWizardStep, setGoalWizardStep] = useState<'scorer' | 'assist'>('scorer')
  const [goalScorerId, setGoalScorerId] = useState<string | null>(null)
  const [liveDeleteConfirmOpen, setLiveDeleteConfirmOpen] = useState(false)
  const [liveDeleting, setLiveDeleting] = useState(false)
  const [editDraft, setEditDraft] = useState<PlayerEditDraft | null>(null)
  const [startingMatch, setStartingMatch] = useState(false)
  const [qaSpeedMultiplier, setQaSpeedMultiplier] = useState<QaSpeedMultiplier>(1)
  const [navOpen, setNavOpen] = useState(false)
  const [reportingTab, setReportingTab] = useState<ReportingTab>('matches')

  const teamOptions = useMemo(
    () => teamsForSelector(teams.map((team) => ({ id: team.id, name: team.name }))),
    [teams],
  )

  const teamSwitchDisabled =
    hasLiveMatch || appMode === 'match' || appMode === 'halftime'

  const navItems = useMemo(
    () =>
      buildAppNavItems({
        activeSection: resolveActiveNavSection(appMode, reportingTab),
        teamReady: Boolean(activeTeamId),
        hasLiveMatch,
      }),
    [appMode, reportingTab, activeTeamId, hasLiveMatch],
  )

  const screenTeamSwitcher = (
    <GlobalTeamSelector
      variant="panel"
      teams={teamOptions}
      activeTeamId={activeTeamId}
      onTeamChange={setActiveTeamId}
      disabled={teamSwitchDisabled}
      disabledReason={teamSwitchDisabled ? 'Team locked during live match' : undefined}
    />
  )

  const handleNavNavigate = useCallback(
    (section: AppNavSection) => {
      switch (section) {
        case 'home':
          setAppMode('home')
          break
        case 'active_match':
          if (!activeTeamId) {
            setToast('Select a team on Home first')
            setAppMode('home')
            break
          }
          if (hasLiveMatch) {
            const inHalftimeSetup =
              Object.keys(halftimeSecondHalf).length > 0 &&
              period === '1st' &&
              !periodClockStarted
            setAppMode(inHalftimeSetup ? 'halftime' : 'match')
          } else if (hasPendingRecap && matchId) {
            setRecapReturnMode('home')
            setAppMode('recap')
          } else {
            setAppMode('match_setup')
          }
          break
        case 'season':
          if (!activeTeamId) {
            setToast('Select a team on Home first')
            setAppMode('home')
            break
          }
          setReportingTab('season')
          setAppMode('reporting')
          break
        case 'recaps':
          if (!activeTeamId) {
            setToast('Select a team on Home first')
            setAppMode('home')
            break
          }
          setAppMode('recap_history')
          break
        case 'roster':
          if (!activeTeamId) {
            setToast('Select a team on Home first')
            setAppMode('home')
            break
          }
          setAppMode('team')
          break
      }
    },
    [
      activeTeamId,
      hasLiveMatch,
      hasPendingRecap,
      matchId,
      halftimeSecondHalf,
      period,
      periodClockStarted,
      setAppMode,
    ],
  )

  const toastOverlay = toast ? (
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-[90] flex justify-center px-4">
      <div className="flex items-center gap-2 rounded-full bg-neon px-4 py-2.5 text-sm font-bold text-neon-foreground shadow-lg">
        <CheckCircle2 className="size-5" strokeWidth={2.5} />
        {toast}
      </div>
    </div>
  ) : null

  const livePitchRef = useRef<LiveTacticalPitchHandle>(null)
  const setupAssignmentsRef = useRef<Record<string, string | null> | null>(null)
  const halftimeAssignmentsRef = useRef<Record<string, string | null> | null>(null)

  const clockSyncRef = useRef({ homeScore, awayScore, seconds, period, periodClockStarted })

  useEffect(() => {
    clockSyncRef.current = { homeScore, awayScore, seconds, period, periodClockStarted }
  }, [homeScore, awayScore, seconds, period, periodClockStarted])

  useEffect(() => {
    if (!activeTeamId) {
      setPendingReviewMatches([])
      return
    }

    let cancelled = false

    void (async () => {
      try {
        const pending = await fetchPendingReviewMatchesByTeamId(activeTeamId)
        if (!cancelled) setPendingReviewMatches(pending)
      } catch (err) {
        console.warn('[pending review] failed to load', err)
        if (!cancelled) setPendingReviewMatches([])
      }
    })()

    return () => {
      cancelled = true
    }
  }, [activeTeamId, appMode])

  const refreshPendingReviewMatches = useCallback(async () => {
    if (!activeTeamId) {
      setPendingReviewMatches([])
      return
    }
    try {
      const pending = await fetchPendingReviewMatchesByTeamId(activeTeamId)
      setPendingReviewMatches(pending)
    } catch (err) {
      console.warn('[pending review] failed to refresh', err)
    }
  }, [activeTeamId])

  const handleOpenPendingReview = useCallback(
    async (targetMatchId: string) => {
      try {
        setRecapReturnMode('home')
        await openMatchRecap(targetMatchId)
      } catch (err) {
        setToast(err instanceof Error ? err.message : 'Failed to open recap')
      }
    },
    [openMatchRecap],
  )

  const handleOpenMatchRecap = useCallback(
    async (targetMatchId: string, returnTo: 'home' | 'recap_history' | 'reporting') => {
      try {
        setRecapReturnMode(returnTo)
        await openMatchRecap(targetMatchId)
      } catch (err) {
        setToast(err instanceof Error ? err.message : 'Failed to open recap')
      }
    },
    [openMatchRecap],
  )

  const handleExitRecap = useCallback(() => {
    if (recapReturnMode === 'recap_history') {
      setAppMode('recap_history')
    } else if (recapReturnMode === 'reporting') {
      setAppMode('reporting')
    } else {
      returnToHome()
      void refreshPendingReviewMatches()
    }
    setRecapReturnMode(null)
  }, [recapReturnMode, returnToHome, refreshPendingReviewMatches, setAppMode])

  const handleFinalizeRecap = useCallback(async () => {
    handleExitRecap()
  }, [handleExitRecap])

  const handleDeleteMatch = useCallback(
    async (targetMatchId: string) => {
      await deleteMatch(targetMatchId)
      void refreshPendingReviewMatches()
      setGoalWizardOpen(false)
      setGoalWizardStep('scorer')
      setGoalScorerId(null)
      setQaSpeedMultiplier(1)
      if (recapReturnMode === 'recap_history') {
        setAppMode('recap_history')
      } else if (recapReturnMode === 'reporting') {
        setAppMode('reporting')
      }
      setRecapReturnMode(null)
    },
    [deleteMatch, refreshPendingReviewMatches, recapReturnMode, setAppMode],
  )

  const attendingCount = getAttendingIds(setupLineup).length
  const activeTeamName =
    teams.find((team) => team.id === activeTeamId)?.name ?? 'Team'
  const maxFieldPlayers = getMaxFieldPlayers(activeTeamFormat)
  const startMatchBlockReason = getSetupLineupBlockReason(setupLineup, maxFieldPlayers)
  const canStartMatch = startMatchBlockReason === null && Boolean(activeTeamId)
  const canBeginSecondHalf = isHalftimeLineupValid(halftimeSecondHalf, maxFieldPlayers)
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

  useEffect(() => {
    const needsTeam =
      appMode === 'match_setup' ||
      appMode === 'team' ||
      appMode === 'reporting' ||
      appMode === 'recap_history'
    if (needsTeam && !activeTeamId) {
      setAppMode('home')
    }
  }, [appMode, activeTeamId, setAppMode])

  const handleStartMatch = useCallback(async () => {
    if (!canStartMatch || !activeTeamId || startingMatch) return

    const team = teams.find((t) => t.id === activeTeamId)
    if (!team) return

    setStartingMatch(true)
    try {
      const resolvedLineup = resolveSetupLineup(
        setupLineup,
        setupAssignmentsRef.current,
      )
      const slotAssignments = setupAssignmentsRef.current
      const resolvedMatchPositions =
        slotAssignments && Object.values(slotAssignments).some(Boolean)
          ? {
              ...matchPositions,
              ...matchPositionsFromSlotAssignments(
                slotAssignments,
                matchFormations.first,
                activeTeamFormat,
              ),
            }
          : matchPositions
      const attendingPlayers = masterRoster.filter(
        (p) => resolvedLineup.attending[p.id] !== false,
      )

      await beginMatch({
        teamId: activeTeamId,
        teamName: team.name,
        coachName: setupCoachName.trim(),
        opponent,
        locationType,
        tournamentGame,
        halfLength: halfLengthMinutes,
        matchDate,
        matchTime,
        attendingPlayers,
        firstHalfStarterIds: getFirstHalfStarterIds(resolvedLineup),
        matchPositions: resolvedMatchPositions,
        firstHalfFormation: matchFormations.first,
      })

      setQaSpeedMultiplier(1)
      setToast('Ready for 1st half')
    } catch (err) {
      setToast(formatSupabaseError(err))
    } finally {
      setStartingMatch(false)
    }
  }, [
    canStartMatch,
    activeTeamId,
    setupCoachName,
    startingMatch,
    teams,
    setupLineup,
    masterRoster,
    opponent,
    locationType,
    tournamentGame,
    halfLengthMinutes,
    matchDate,
    matchTime,
    matchPositions,
    matchFormations,
    activeTeamFormat,
    beginMatch,
  ])

  const handleConfirmLiveDeleteMatch = useCallback(async () => {
    if (!matchId) return
    setLiveDeleting(true)
    try {
      await handleDeleteMatch(matchId)
      setLiveDeleteConfirmOpen(false)
      setToast('Match deleted')
    } catch (err) {
      setToast(err instanceof Error ? err.message : 'Failed to delete match')
    } finally {
      setLiveDeleting(false)
    }
  }, [matchId, handleDeleteMatch])

  const handleEndGame = useCallback(async () => {
    setRunning(false)
    await finishGame(seconds)
    if (matchId) {
      syncMatchRecord(matchId, {
        period_clock_started: false,
        clock_seconds: seconds,
      })
    }
    setToast('Match complete — finish your post-game recap')
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
    const newClock = halfDurationSeconds(halfLengthMinutes)
    await beginSecondHalf(assignments)
    if (matchId) {
      syncMatchRecord(matchId, {
        period: '2nd',
        clock_seconds: newClock,
        period_clock_started: true,
      })
    }
    setToast(`2nd half underway · ${formatClock(newClock)}`)
  }, [canBeginSecondHalf, halfLengthMinutes, matchId, beginSecondHalf, halftimeSlotAssignments])

  const handleLoadLineupPreset = useCallback(
    (presetId: string) => {
      const preset = lineupPresets.find((p) => p.id === presetId)
      if (!preset) return
      try {
        applyLineupPreset(preset)
        setToast(`Loaded preset · ${preset.preset_name}`)
      } catch (err) {
        setToast(err instanceof Error ? err.message : 'Failed to load preset')
      }
    },
    [lineupPresets, applyLineupPreset],
  )

  const handleLoadHalftimePreset = useCallback(
    (presetId: string) => {
      const preset = lineupPresets.find((p) => p.id === presetId)
      if (!preset) return
      try {
        applyHalftimeLineupPreset(preset)
        setToast(`Loaded 2nd half preset · ${preset.preset_name}`)
      } catch (err) {
        setToast(err instanceof Error ? err.message : 'Failed to load preset')
      }
    },
    [lineupPresets, applyHalftimeLineupPreset],
  )

  const openEditPlayer = useCallback(
    (id: string) => {
      const player = masterRoster.find((p) => p.id === id)
      if (!player) return
      setEditDraft({
        id: player.id,
        firstName: player.firstName,
        lastName: player.lastName,
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
    const firstName = editDraft.firstName.trim()
    const lastName = editDraft.lastName.trim()
    if (!firstName || !lastName) return

    const jerseyRaw = editDraft.number.trim()
    let jersey: number | null = null
    if (jerseyRaw !== '') {
      const parsed = Number(jerseyRaw)
      if (Number.isNaN(parsed)) return
      jersey = parsed
    }

    try {
      await updatePlayer(editDraft.id, {
        firstName,
        lastName,
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
      firstName: string
      lastName: string
      jersey: number | null
      isGuest: boolean
      primaryPosition?: string
      secondaryPosition?: string
    }) => {
      try {
        await addPlayer(input)
        const jerseyLabel = input.jersey !== null ? `#${input.jersey} ` : ''
        setToast(`Added ${jerseyLabel}${formatPlayerFullName(input.firstName, input.lastName)}`)
      } catch (err) {
        setToast(err instanceof Error ? err.message : 'Failed to add player')
        throw err
      }
    },
    [addPlayer],
  )

  const handleLiveFormationSwitch = useCallback(
    (nextFormationId: string, remap: FormationRemapResult) => {
      if (!matchId) return
      const eventTimestamp = elapsedInHalf(seconds, halfLengthMinutes)
      const previousLabel = getFormationLabel(activeFormation)
      const nextLabel = getFormationLabel(nextFormationId)

      setActiveFormation(nextFormationId)

      syncMatchEvents([
        {
          matchId,
          eventType: 'formation_change',
          timestamp: eventTimestamp,
          formation: nextFormationId,
          eventNotes: `${previousLabel} → ${nextLabel}`,
        },
      ])

      if (remap.positionUpdates.length > 0 || remap.overflowPlayerIds.length > 0) {
        setPlayers((prev) => {
          let next = prev.map((player) => {
            const update = remap.positionUpdates.find((u) => u.playerId === player.id)
            return update ? { ...player, matchPosition: update.position } : player
          })

          for (const update of remap.positionUpdates) {
            const updated = next.find((p) => p.id === update.playerId)
            if (updated) syncMatchStat(matchId, updated)
            syncMatchEvents([
              {
                matchId,
                playerId: update.playerId,
                eventType: 'position_change',
                timestamp: eventTimestamp,
                eventNotes: update.position,
                formation: nextFormationId,
              },
            ])
          }

          for (const playerId of remap.overflowPlayerIds) {
            next = applySubOut(next, playerId, seconds)
            const fieldPlayer = next.find((p) => p.id === playerId)
            if (fieldPlayer) {
              syncMatchStat(matchId, fieldPlayer)
              syncMatchEvents([
                {
                  matchId,
                  playerId: fieldPlayer.id,
                  eventType: 'sub_out',
                  timestamp: eventTimestamp,
                  formation: nextFormationId,
                },
              ])
            }
          }

          return next
        })
      }

      const overflowNote =
        remap.overflowPlayerIds.length > 0
          ? ` · ${remap.overflowPlayerIds.length} to bench`
          : ''
      setToast(`Formation · ${nextLabel}${overflowNote}`)
    },
    [matchId, seconds, halfLengthMinutes, activeFormation, players, setActiveFormation, setPlayers],
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
      if (onFieldCount >= maxFieldPlayers) return

      const eventTimestamp = elapsedInHalf(seconds, halfLengthMinutes)
      const sidelineMap = buildSidelineNameMap(players.filter((p) => p.attending))

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
              eventNotes: tacticalPosition,
            },
          ])
          setToast(`Sub in · ${formatPlayerLabel(benchPlayer, sidelineMap)}`)
        }
        return next
      })
    },
    [matchId, players, seconds, halfLengthMinutes, activeFormation, maxFieldPlayers, setPlayers],
  )

  const handleLiveSubOut = useCallback(
    (fieldId: string) => {
      if (!matchId) return
      const eventTimestamp = elapsedInHalf(seconds, halfLengthMinutes)
      const sidelineMap = buildSidelineNameMap(players.filter((p) => p.attending))

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
          setToast(`Sub out · ${formatPlayerLabel(fieldPlayer, sidelineMap)}`)
        }
        return next
      })
    },
    [matchId, players, seconds, halfLengthMinutes, activeFormation, setPlayers],
  )

  const handleLiveSwap = useCallback(
    (benchId: string, fieldId: string, tacticalPosition: string) => {
      if (!matchId) return
      const eventTimestamp = elapsedInHalf(seconds, halfLengthMinutes)
      const sidelineMap = buildSidelineNameMap(players.filter((p) => p.attending))

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
              eventNotes: tacticalPosition,
            },
          ])
          setToast(
            `Sub · ${formatPlayerLabel(benchPlayer, sidelineMap)} for ${formatPlayerLabel(fieldPlayer, sidelineMap)}`,
          )
        }
        return next
      })
    },
    [matchId, players, seconds, halfLengthMinutes, activeFormation, setPlayers],
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

  const handleOpponentGoal = useCallback(() => {
    if (!matchId) return

    const eventTimestamp = elapsedInHalf(seconds, halfLengthMinutes)
    const opponentLabel = matchOpponent.trim() || 'Opponent'

    setAwayScore((current) => {
      const next = current + 1
      syncMatchRecord(matchId, { away_score: next })
      setToast(`Opponent goal · ${opponentLabel} ${next}`)
      return next
    })

    syncMatchEvent({
      matchId,
      eventType: 'opponent_goal',
      timestamp: eventTimestamp,
      formation: activeFormation,
    })

    setPlayers((prev) => {
      const next = applyPlusMinusDelta(prev, -1)
      if (matchId) syncMatchStats(matchId, next)
      return next
    })
  }, [matchId, seconds, halfLengthMinutes, activeFormation, matchOpponent, setAwayScore, setPlayers])

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

      setPlayers((prev) => {
        const next = applyPlusMinusDelta(prev, 1)
        if (matchId) syncMatchStats(matchId, next)
        return next
      })

      const assistPlayer = assistPlayerId
        ? players.find((p) => p.id === assistPlayerId)
        : null
      const sidelineMap = buildSidelineNameMap(players.filter((p) => p.attending))
      const scorerLabel = formatPlayerLabel(scorer, sidelineMap)
      const assistLabel = assistPlayer
        ? formatPlayerLabel(assistPlayer, sidelineMap)
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
      setPlayers,
    ],
  )

  const handleShareStatTracker = useCallback(async () => {
    if (!matchId) return

    try {
      const token = await ensureStatTrackerToken(matchId)
      const url = buildStatTrackerUrl(matchId, token)
      const preferNativeShare =
        typeof navigator.share === 'function' &&
        (window.matchMedia('(pointer: coarse)').matches ||
          /iPhone|iPad|iPod|Android/i.test(navigator.userAgent))

      if (preferNativeShare) {
        await navigator.share({
          title: 'Sideline Stat Tracker',
          text: 'Tap to log player stats during the match.',
          url,
        })
        setToast(`Stat tracker link shared (${window.location.host})`)
        return
      }

      await navigator.clipboard.writeText(url)
      setToast(`Stat tracker link copied — open on ${window.location.host}`)

      if (import.meta.env.DEV) {
        window.open(url, '_blank', 'noopener,noreferrer')
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return
      setToast(err instanceof Error ? err.message : 'Failed to create stat tracker link')
    }
  }, [matchId, setToast])

  function renderScreen(): ReactNode {
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

  if (appMode === 'home') {
    const matchLabel =
      matchId && matchTeamName
        ? `${matchTeamName}${matchOpponent ? ` vs ${matchOpponent}` : ''}`
        : undefined
    const visiblePendingReviewMatches = hasPendingRecap
      ? pendingReviewMatches.filter((match) => match.id !== matchId)
      : pendingReviewMatches

    return (
      <HomeScreen
        teams={teams.map((team) => ({ id: team.id, name: team.name }))}
        activeTeamId={activeTeamId}
        onTeamChange={setActiveTeamId}
        onAddTeam={async (name) => createTeam(name)}
        hasActiveMatch={hasLiveMatch}
        activeMatchLabel={matchLabel}
        hasPendingRecap={hasPendingRecap}
        pendingRecapLabel={matchLabel}
        onCompleteMatchRecap={() => setAppMode('recap')}
        pendingReviewMatches={visiblePendingReviewMatches}
        onOpenPendingReview={(id) => void handleOpenPendingReview(id)}
        onTeamManagement={() => setAppMode('team')}
        onNewGame={() => setAppMode('match_setup')}
        onReporting={() => {
          setReportingTab('matches')
          setAppMode('reporting')
        }}
        onViewRecaps={() => setAppMode('recap_history')}
        onResumeMatch={() => setAppMode('match')}
      />
    )
  }

  if (appMode === 'match_setup') {
    if (!activeTeamId) return null

    return (
      <>
        <SetupScreen
          activeTeamId={activeTeamId}
          activeTeamName={activeTeamName}
          activeTeamFormat={activeTeamFormat}
          teamSwitcher={screenTeamSwitcher}
          coachName={setupCoachName}
          onCoachNameChange={setSetupCoachName}
          coachSuggestions={coachSuggestions}
          rosterLoading={rosterLoading}
          suggestedJersey={suggestedJersey}
          onAddPlayer={handleAddPlayer}
          opponent={opponent}
          onOpponentChange={setOpponent}
          matchDate={matchDate}
          onMatchDateChange={setMatchDate}
          matchTime={matchTime}
          onMatchTimeChange={setMatchTime}
          locationType={locationType}
          onLocationTypeChange={setLocationType}
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
          startMatchBlockReason={startingMatch ? 'Getting ready…' : startMatchBlockReason}
          attendingCount={attendingCount}
          lineupPresets={lineupPresets}
          onLoadLineupPreset={handleLoadLineupPreset}
          onBackToHome={() => setAppMode('home')}
          setupSlotAssignments={setupSlotAssignments}
          setupPitchKey={setupPitchKey}
          setupAssignmentsRef={setupAssignmentsRef}
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
    if (!activeTeamId) return null

    return (
      <>
        <TeamManagementScreen
          activeTeamId={activeTeamId}
          activeTeamName={activeTeamName}
          activeTeamFormat={activeTeamFormat}
          teamSwitcher={screenTeamSwitcher}
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
          onUpdateTeamFormat={updateTeamFormat}
          primaryCoachName={activeTeamPrimaryCoachName}
          onUpdatePrimaryCoach={async (name) => {
            await updateTeamPrimaryCoach(name)
          }}
          scheduledMatches={scheduledMatches}
          scheduledLoading={scheduledLoading}
          onRefreshScheduledMatches={refreshScheduledMatches}
          onCreateScheduledMatch={createScheduledMatch}
          onDeleteScheduledMatch={removeScheduledMatch}
          onUseScheduledMatch={loadScheduledMatchIntoSetup}
          onBackToHome={() => setAppMode('home')}
          onToast={setToast}
        />
      </>
    )
  }

  if (appMode === 'recap_history') {
    if (!activeTeamId) return null

    return (
      <>
        <MatchRecapHistoryScreen
          activeTeamId={activeTeamId}
          activeTeamName={activeTeamName}
          teamSwitcher={screenTeamSwitcher}
          onOpenRecap={(id) => void handleOpenMatchRecap(id, 'recap_history')}
          onDeleteMatch={handleDeleteMatch}
          onBackToHome={() => setAppMode('home')}
          onToast={setToast}
        />
      </>
    )
  }

  if (appMode === 'reporting') {
    if (!activeTeamId) return null

    return (
      <ReportingScreen
        activeTeamId={activeTeamId}
        activeTeamName={activeTeamName}
        teamSwitcher={screenTeamSwitcher}
        teamRoster={teamRoster}
        pendingReviewMatches={pendingReviewMatches}
        initialTab={reportingTab}
        onOpenPendingReview={(id) => void handleOpenPendingReview(id)}
        onOpenMatchRecap={(id) => void handleOpenMatchRecap(id, 'reporting')}
        onViewRecaps={() => setAppMode('recap_history')}
        onRefreshRoster={loadFullTeamRoster}
        onBackToHome={() => setAppMode('home')}
      />
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
          assignmentsResetKey={`halftime-${matchId ?? 'local'}-${halftimePitchKey}`}
          carriedFromFirstHalf={carriedFromFirstHalf}
          halftimeAssignmentsRef={halftimeAssignmentsRef}
          lineupPresets={lineupPresets}
          onLoadLineupPreset={handleLoadHalftimePreset}
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
          onBackToHome={() => setAppMode('home')}
          activeTeamFormat={activeTeamFormat}
        />
      </>
    )
  }

  if (appMode === 'recap' && matchId) {
    return (
      <>
        <PostGameRecap
          matchId={matchId}
          teamName={matchTeamName}
          coachName={matchCoachName}
          opponent={matchOpponent}
          locationType={matchLocationType}
          homeScore={homeScore}
          awayScore={awayScore}
          halfLengthMinutes={halfLengthMinutes}
          players={players}
          isCompletedMatch={matchStatus === 'completed'}
          onFinalize={() => void handleFinalizeRecap()}
          onDeleteMatch={handleDeleteMatch}
          onHome={handleExitRecap}
          onToast={setToast}
        />
      </>
    )
  }

  return (
    <main className={`${APP_SHELL} pb-10 md:pb-12`}>
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
        qaSpeed={qaSpeedMultiplier}
        onQaSpeedChange={setQaSpeedMultiplier}
        onHome={() => setAppMode('home')}
      />

      <div className={`${APP_CONTAINER} space-y-6 pt-5 md:space-y-8 md:pt-6`}>
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
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setGoalWizardOpen(true)}
              className="flex items-center justify-center gap-2 rounded-2xl bg-neon py-6 font-display text-2xl font-black uppercase tracking-wide text-neon-foreground shadow-xl shadow-neon/30 transition-transform active:scale-[0.98] active:brightness-95"
            >
              <Goal className="size-8" strokeWidth={2.5} />
              Goal
            </button>
            <button
              type="button"
              onClick={handleOpponentGoal}
              className="flex items-center justify-center gap-2 rounded-2xl border-2 border-border bg-secondary py-6 font-display text-xl font-black uppercase tracking-wide text-muted-foreground shadow-md transition-transform active:scale-[0.98] active:bg-secondary/80"
            >
              <Shield className="size-7" strokeWidth={2.5} />
              Opp. Goal
            </button>
          </div>
        )}

        {matchId ? (
          <button
            type="button"
            onClick={() => void handleShareStatTracker()}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-athletic/30 bg-athletic/10 py-3 text-sm font-bold uppercase tracking-wide text-athletic transition-transform active:scale-[0.98]"
          >
            <Share2 className="size-4" />
            Share Stat Tracker
          </button>
        ) : null}

        {matchId ? <SidelineStatsPanel matchId={matchId} players={players} /> : null}

        <LiveTacticalPitch
          ref={livePitchRef}
          key={period}
          periodKey={period}
          formationId={activeFormation}
          onFormationSwitch={handleLiveFormationSwitch}
          players={players}
          clockSeconds={seconds}
          maxFieldPlayers={maxFieldPlayers}
          teamFormat={activeTeamFormat}
          initialSlotAssignments={period === '2nd' ? secondHalfSlotAssignments : undefined}
          onSwap={handleLiveSwap}
          onSubIn={handleLiveSubIn}
          onSubOut={handleLiveSubOut}
          onReassignPosition={handleLiveReassignPosition}
        />

        <div className="pt-2">
          <button
            type="button"
            onClick={() => setLiveDeleteConfirmOpen(true)}
            className="delete-match-action min-h-12 w-full touch-manipulation rounded-xl border-2 border-danger/70 bg-danger/10 py-3 text-sm font-bold uppercase tracking-widest text-danger active:scale-[0.98]"
          >
            Delete Game / Clear Match Data
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

      <DeleteMatchConfirmModal
        open={liveDeleteConfirmOpen}
        matchLabel={
          matchId
            ? `${matchTeamName || 'Team'} vs ${matchOpponent.trim() || 'Opponent'}`
            : undefined
        }
        busy={liveDeleting}
        onCancel={() => {
          if (!liveDeleting) setLiveDeleteConfirmOpen(false)
        }}
        onConfirm={() => void handleConfirmLiveDeleteMatch()}
      />
    </main>
  )
  }

  return (
    <>
      <AppNavDrawer
        open={navOpen}
        onOpenChange={setNavOpen}
        items={navItems}
        onNavigate={handleNavNavigate}
        teams={teamOptions}
        activeTeamId={activeTeamId}
        onTeamChange={setActiveTeamId}
        teamSwitchDisabled={teamSwitchDisabled}
        teamLabel={activeTeamName || undefined}
      />
      <AppNavShell>{renderScreen()}</AppNavShell>
      {toastOverlay}
    </>
  )
}
