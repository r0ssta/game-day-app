import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type MutableRefObject, type ReactNode } from 'react'
import {
  CheckCircle2,
  Goal,
  Lock,
  Share2,
  Shield,
  UserPlus,
  X,
} from 'lucide-react'
import { DeleteMatchConfirmModal } from '@/components/DeleteMatchConfirmModal'
import { EndMatchTimingModal } from '@/components/EndMatchTimingModal'
import { GoalWizardModal, type GoalWizardStep, type GoalWizardTeam } from '@/components/GoalWizardModal'
import { HomeScreen } from '@/components/HomeScreen'
import { SidelineStatsPanel } from '@/components/SidelineStatsPanel'
import { SubbingAssistantPanel } from '@/components/SubbingAssistantPanel'
import { SubCountdownTimer } from '@/components/SubCountdownTimer'
import { PenaltyShootoutScreen } from '@/components/PenaltyShootoutScreen'
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
import { formatTeamDisplayName } from '@/lib/age-groups'
import { resolveTeamAgeGroup } from '@/lib/season-roster'
import type { ReportingTab } from '@/components/reporting/ReportingTabBar'
import { TeamManagementScreen } from '@/components/TeamManagementScreen'
import {
  LiveTacticalPitch,
  type LiveTacticalPitchHandle,
  type PositionReassignUpdate,
} from '@/components/LiveTacticalPitch'
import { PostGameRecap } from '@/components/PostGameRecap'
import { MatchRecapHistoryScreen } from '@/components/MatchRecapHistoryScreen'
import { ClubAdminScreen } from '@/components/ClubAdminScreen'
import {
  DEFAULT_PRIMARY_POSITION,
  DEFAULT_SECONDARY_POSITION,
  RosterPositionFields,
} from '@/components/RosterPositionFields'
import { TacticalPitchLineup } from '@/components/TacticalPitchLineup'
import { useGameDayApp } from '@/hooks/useGameDayApp'
import { useWakeLock, WAKE_LOCK_BLOCKED_TOAST } from '@/hooks/useWakeLock'
import { useAuth } from '@/contexts/AuthContext'
import { formatAppRoleLabel } from '@/lib/staff-roles'
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
import type { SubFrequency } from '@/lib/sub-rotation'
import {
  ENABLE_QA_SPEED,
  ENABLE_SUB_ASSISTANT,
  ENABLE_WAKE_LOCK,
} from '@/lib/feature-flags'
import {
  applySubIn,
  applySubOut,
  applySubstitution,
  formatPlayingTimeBadge,
  stampAllOnField,
} from '@/lib/play-time'
import {
  elapsedInHalf,
  formatClock,
  formatMatchClockParts,
  halfDurationSeconds,
  isHalfExpired,
  isInAddedTime,
  persistableClockSeconds,
  QA_SPEED_MULTIPLIERS,
  tickCountdownClock,
  type QaSpeedMultiplier,
} from '@/lib/match-clock'
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
import {
  encodePkAttemptNotes,
  shouldEnterPenaltyShootout,
  shouldResumePenaltyShootout,
} from '@/lib/penalty-kicks'
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
import {
  APP_CONTAINER,
  APP_SHELL,
  MODAL_OVERLAY,
  MODAL_PANEL,
  TOUCH_ICON_BUTTON,
} from '@/lib/layout'

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

function MatchCoachSelect({
  id,
  value,
  onChange,
  teamHeadCoaches,
  teamAssistants,
  allCoachNames,
}: {
  id: string
  value: string
  onChange: (value: string) => void
  teamHeadCoaches: string[]
  teamAssistants: string[]
  allCoachNames: string[]
}) {
  const teamNames = useMemo(() => {
    const seen = new Set<string>()
    const ordered: Array<{ name: string; role: 'Head Coach' | 'Assistant Coach' }> = []
    for (const name of teamHeadCoaches) {
      const key = name.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      ordered.push({ name, role: 'Head Coach' })
    }
    for (const name of teamAssistants) {
      const key = name.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      ordered.push({ name, role: 'Assistant Coach' })
    }
    return ordered
  }, [teamHeadCoaches, teamAssistants])

  const otherCoaches = useMemo(() => {
    const teamKeys = new Set(teamNames.map((entry) => entry.name.toLowerCase()))
    return allCoachNames
      .filter((name) => name.trim() && !teamKeys.has(name.toLowerCase()))
      .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
  }, [allCoachNames, teamNames])

  const selectedValue = useMemo(() => {
    const needle = value.trim().toLowerCase()
    if (!needle) return ''
    const fromTeam = teamNames.find((entry) => entry.name.toLowerCase() === needle)
    if (fromTeam) return fromTeam.name
    const fromClub = otherCoaches.find((name) => name.toLowerCase() === needle)
    return fromClub ?? ''
  }, [value, teamNames, otherCoaches])

  return (
    <div>
      <label
        htmlFor={id}
        className="mb-2 block text-xs font-bold uppercase tracking-widest text-muted-foreground"
      >
        Head Coach
      </label>
      <select
        id={id}
        value={selectedValue}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-xl border border-border bg-card px-4 py-3 text-lg font-semibold text-foreground focus:border-neon focus:outline-none focus:ring-2 focus:ring-neon/30"
      >
        <option value="" disabled>
          Select a coach…
        </option>
        {teamNames.length > 0 ? (
          <optgroup label="This team">
            {teamNames.map((entry) => (
              <option key={`${entry.role}-${entry.name}`} value={entry.name}>
                {entry.name} ({entry.role})
              </option>
            ))}
          </optgroup>
        ) : null}
        {otherCoaches.length > 0 ? (
          <optgroup label="Club directors & coaches">
            {otherCoaches.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </optgroup>
        ) : null}
      </select>
      {teamAssistants.length > 0 ? (
        <p className="mt-2 text-xs font-semibold text-muted-foreground">
          Assistant{teamAssistants.length === 1 ? '' : 's'} on this team:{' '}
          <span className="text-foreground">{teamAssistants.join(', ')}</span>
        </p>
      ) : null}
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
  /** True when Screen Wake Lock is held (keeps display on). */
  wakeLockActive?: boolean
  onHome: () => void
  onLogGoal?: () => void
  onOpponentGoal?: () => void
  onShareStatTracker?: () => void
}

function QaSpeedControls({
  speed,
  onSpeedChange,
}: {
  speed: QaSpeedMultiplier
  onSpeedChange: (speed: QaSpeedMultiplier) => void
}) {
  return (
    <div className="w-full rounded-xl border border-orange-500/40 bg-orange-600/10 px-3 py-2">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="text-[10px] font-black uppercase tracking-widest text-orange-400">
          QA Test Speed
        </span>
        <span className="text-[10px] font-semibold text-orange-300/80">
          {speed === 1 ? 'Normal' : `${speed}×`}
        </span>
      </div>
      <div
        className="grid grid-cols-3 gap-1.5"
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
              'min-h-10 touch-manipulation rounded-lg px-2 py-2 text-xs font-black tabular-nums uppercase tracking-wide transition-all active:scale-[0.97]',
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
  wakeLockActive = false,
  onHome,
  onLogGoal,
  onOpponentGoal,
  onShareStatTracker,
}: MatchHeaderProps) {
  const homeLabel = teamName.trim() || 'Home'
  const awayName = opponent.trim() || 'Opponent'
  const halfReference = formatClock(halfDurationSeconds(halfLengthMinutes))
  const coachLine = coachName.trim() ? `Coach: ${coachName.trim()}` : null
  const regulationElapsed = periodClockStarted && isHalfExpired(seconds)
  const inAddedTime = periodClockStarted && isInAddedTime(seconds)
  const waitingToStart = !periodClockStarted
  const clockParts = formatMatchClockParts(seconds)
  const showGoalActions = Boolean(periodClockStarted && onLogGoal && onOpponentGoal)

  return (
    <header className="sticky top-14 z-30 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className={`${APP_CONTAINER} space-y-2 py-2`}>
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <p className="truncate text-center text-xs font-bold text-foreground sm:text-sm">
              <span>{homeLabel}</span>
              <span className="mx-1 text-muted-foreground">vs</span>
              <span>{awayName}</span>
            </p>
            {coachLine ? (
              <p className="truncate text-center text-[10px] font-semibold text-muted-foreground">
                {coachLine}
              </p>
            ) : null}
          </div>
          <BackToHomeButton onClick={onHome} />
        </div>

        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1 text-center">
            <p className="truncate text-[9px] font-bold uppercase tracking-widest text-neon">
              {homeLabel}
            </p>
            <p className="font-display text-3xl font-black tabular-nums leading-none text-neon">
              {homeScore}
            </p>
          </div>

          <div className="flex shrink-0 flex-col items-center gap-0.5">
            <div className="flex items-center gap-1.5">
              {running ? (
                <span className="size-1.5 animate-pulse rounded-full bg-neon" />
              ) : null}
              {inAddedTime ? (
                <span className="rounded bg-athletic px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide text-white">
                  +Time
                </span>
              ) : regulationElapsed ? (
                <span className="rounded bg-orange-600 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide text-white">
                  Reg
                </span>
              ) : null}
              <span
                className={cn(
                  'font-display text-2xl font-bold tabular-nums tracking-wider sm:text-3xl',
                  inAddedTime
                    ? 'text-athletic'
                    : waitingToStart
                      ? 'text-muted-foreground'
                      : 'text-neon',
                )}
              >
                {clockParts.regulation}
              </span>
              {clockParts.addedLabel ? (
                <span className="font-display text-lg font-black tabular-nums text-athletic">
                  {clockParts.addedLabel}
                </span>
              ) : null}
              <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                {periodLabel(period)}
              </span>
              {wakeLockActive ? (
                <span
                  className="inline-flex items-center text-muted-foreground"
                  title="Screen stay-awake is on"
                  aria-label="Screen stay-awake is on"
                >
                  <Lock className="size-3.5" strokeWidth={2.5} aria-hidden />
                </span>
              ) : null}
            </div>
            <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">
              {waitingToStart
                ? `Ready · ${halfReference}`
                : inAddedTime
                  ? 'Added time'
                  : regulationElapsed
                    ? 'Regulation done'
                    : `${halfReference} half`}
            </span>
          </div>

          <div className="min-w-0 flex-1 text-center">
            <p className="truncate text-[9px] font-bold uppercase tracking-widest text-muted-foreground">
              {awayName}
            </p>
            <p className="font-display text-3xl font-black tabular-nums leading-none text-foreground">
              {awayScore}
            </p>
          </div>
        </div>

        {showGoalActions ? (
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={onLogGoal}
              className="flex min-h-11 touch-manipulation items-center justify-center gap-1.5 rounded-xl bg-neon px-2 py-2.5 font-display text-sm font-black uppercase tracking-wide text-neon-foreground shadow-md shadow-neon/25 active:scale-[0.98]"
            >
              <Goal className="size-4" strokeWidth={2.5} />
              Goal
            </button>
            <button
              type="button"
              onClick={onOpponentGoal}
              className="flex min-h-11 touch-manipulation items-center justify-center gap-1.5 rounded-xl border-2 border-border bg-secondary px-2 py-2.5 font-display text-sm font-black uppercase tracking-wide text-muted-foreground active:scale-[0.98]"
            >
              <Shield className="size-4" strokeWidth={2.5} />
              Opp. Goal
            </button>
          </div>
        ) : null}

        {onShareStatTracker ? (
          <button
            type="button"
            onClick={onShareStatTracker}
            className="flex min-h-11 w-full touch-manipulation items-center justify-center gap-2 rounded-xl border-2 border-athletic/40 bg-athletic/10 px-3 py-2.5 text-xs font-bold uppercase tracking-wide text-athletic active:scale-[0.98]"
          >
            <Share2 className="size-4" strokeWidth={2.5} />
            Share Stat Tracker
          </button>
        ) : null}
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

function AddPlayerToRoster({
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

type SetupScreenProps = {
  activeTeamId: string | null
  activeTeamName: string
  activeTeamFormat: TeamFormat
  teamSwitcher: ReactNode
  coachName: string
  onCoachNameChange: (value: string) => void
  teamHeadCoaches: string[]
  teamAssistants: string[]
  allCoachNames: string[]
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
  goesToPks: boolean
  onGoesToPksChange: (value: boolean) => void
  halfLengthMinutes: number
  onHalfLengthChange: (value: number) => void
  gkPlaysFullHalf: boolean
  onGkPlaysFullHalfChange: (value: boolean) => void
  subFrequency: SubFrequency
  onSubFrequencyChange: (value: SubFrequency) => void
  onSetupSubIntervalMinutesChange: (minutes: number | null) => void
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
  guestAgeGroup: import('@/lib/age-groups').AgeGroup
  onAddGuestFromPool: (playerId: string) => Promise<void>
  loadAgeGroupPool: (ageGroup: import('@/lib/age-groups').AgeGroup) => Promise<import('@/types/database').DbPlayer[]>
}

function SetupScreen({
  activeTeamId,
  activeTeamName,
  activeTeamFormat,
  teamSwitcher,
  coachName,
  onCoachNameChange,
  teamHeadCoaches,
  teamAssistants,
  allCoachNames,
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
  goesToPks,
  onGoesToPksChange,
  halfLengthMinutes,
  onHalfLengthChange,
  gkPlaysFullHalf,
  onGkPlaysFullHalfChange,
  subFrequency,
  onSubFrequencyChange,
  onSetupSubIntervalMinutesChange,
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
  guestAgeGroup,
  onAddGuestFromPool,
  loadAgeGroupPool,
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
    <main className={APP_SHELL}>
      <div className={`${APP_CONTAINER} space-y-3 pt-4 md:pt-5`}>
        <ScreenHeader
          title="Game Day Setup"
          subtitle={`Pre-game lineup and match details for ${activeTeamName}.`}
          onHome={onBackToHome}
          teamSwitcher={teamSwitcher}
        />

            <p className="rounded-xl border border-neon/30 bg-neon/5 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {activeTeamFormat} format · {maxFieldPlayers} on field
            </p>

            <MatchCoachSelect
              id="head-coach"
              value={coachName}
              onChange={onCoachNameChange}
              teamHeadCoaches={teamHeadCoaches}
              teamAssistants={teamAssistants}
              allCoachNames={allCoachNames}
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

            {tournamentGame ? (
              <div className="flex items-center justify-between gap-3 rounded-xl border border-athletic/40 bg-athletic/10 px-4 py-3">
                <span className="text-sm font-bold text-foreground">
                  Would this game go to PKs if it ends in a tie?
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={goesToPks}
                  onClick={() => onGoesToPksChange(!goesToPks)}
                  className={cn(
                    'relative h-8 w-14 shrink-0 rounded-full transition-colors',
                    goesToPks ? 'bg-neon' : 'bg-secondary',
                  )}
                >
                  <span
                    className={cn(
                      'absolute top-1 size-6 rounded-full bg-white shadow transition-transform',
                      goesToPks ? 'left-7' : 'left-1',
                    )}
                  />
                </button>
              </div>
            ) : null}

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

            {ENABLE_SUB_ASSISTANT ? (
              <SubbingAssistantPanel
                teamFormat={activeTeamFormat}
                halfLengthMinutes={halfLengthMinutes}
                attendingCount={attendingCount}
                gkPlaysFullHalf={gkPlaysFullHalf}
                onGkPlaysFullHalfChange={onGkPlaysFullHalfChange}
                subFrequency={subFrequency}
                onSubFrequencyChange={onSubFrequencyChange}
                onIntervalMinutesChange={onSetupSubIntervalMinutesChange}
              />
            ) : null}

            {masterRoster.length > 0 ? (
              <div
                aria-label="Attendance tracker"
                className="attendance-tracker rounded-2xl border-2 border-border bg-card p-3"
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <h2 className="font-display text-sm font-black uppercase tracking-wide text-foreground">
                    Attendance Tracker
                  </h2>
                  <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                    {attendingCount}/{masterRoster.length} attending
                  </span>
                </div>
                <ul className="space-y-2">
                  {masterRoster.map((player) => {
                    const isAttending = setupLineup.attending[player.id] !== false
                    return (
                      <li
                        key={player.id}
                        className="flex items-center gap-2 rounded-xl border-2 border-border bg-background px-3 py-2"
                      >
                        <span className="flex size-9 shrink-0 items-center justify-center rounded-full border-2 border-neon/40 bg-neon/10 font-display text-sm font-bold tabular-nums text-neon">
                          {player.number ?? '—'}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-sm font-bold text-foreground">
                          {formatPlayerFullName(player.firstName, player.lastName)}
                        </span>
                        <div className="flex shrink-0 gap-1">
                          <button
                            type="button"
                            aria-pressed={isAttending}
                            onClick={() => onSetAttending(player.id, true)}
                            className={cn(
                              'min-h-10 touch-manipulation rounded-lg border-2 px-3 text-[10px] font-bold uppercase tracking-wide',
                              isAttending
                                ? 'border-neon bg-neon text-neon-foreground'
                                : 'border-border bg-secondary text-muted-foreground',
                            )}
                          >
                            Attending
                          </button>
                          <button
                            type="button"
                            aria-pressed={!isAttending}
                            onClick={() => onSetAttending(player.id, false)}
                            className={cn(
                              'min-h-10 touch-manipulation rounded-lg border-2 px-3 text-[10px] font-bold uppercase tracking-wide',
                              !isAttending
                                ? 'border-foreground bg-foreground text-background'
                                : 'border-border bg-secondary text-muted-foreground',
                            )}
                          >
                            Absent
                          </button>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </div>
            ) : null}

          <section aria-label="Lineup builder" className="space-y-3 pb-2">
            {rosterLoading ? (
              <p className="rounded-xl border border-border bg-card px-4 py-8 text-center text-sm text-muted-foreground">
                Loading roster…
              </p>
            ) : masterRoster.length === 0 ? (
              <div className="space-y-3">
                <p className="rounded-xl border border-dashed border-border bg-card px-4 py-8 text-center text-sm text-muted-foreground">
                  No players on this team yet. Add a player below to get started.
                </p>
                <AddPlayerToRoster
                  selectedTeamId={activeTeamId}
                  ageGroup={guestAgeGroup}
                  excludePlayerIds={masterRoster.map((player) => player.id)}
                  loadAgeGroupPool={loadAgeGroupPool}
                  onAddFromPool={onAddGuestFromPool}
                  suggestedJersey={suggestedJersey}
                  onAdd={onAddPlayer}
                />
              </div>
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
                  constrainLists={false}
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
                  ageGroup={guestAgeGroup}
                  excludePlayerIds={masterRoster.map((player) => player.id)}
                  loadAgeGroupPool={loadAgeGroupPool}
                  onAddFromPool={onAddGuestFromPool}
                  suggestedJersey={suggestedJersey}
                  onAdd={onAddPlayer}
                />
              </>
            )}
          </section>
      </div>

      <div className="sticky bottom-0 z-20 space-y-2 border-t-2 border-border bg-background/95 px-4 pt-3 backdrop-blur supports-[backdrop-filter]:bg-background/90 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6">
        <div className="mx-auto w-full max-w-md md:max-w-2xl lg:max-w-4xl">
          <button
            type="button"
            onClick={onStartMatch}
            disabled={!canStartMatch}
            className="flex min-h-14 w-full touch-manipulation items-center justify-center gap-3 rounded-xl bg-neon py-5 text-neon-foreground shadow-lg shadow-neon/20 transition-transform active:scale-[0.98] active:brightness-95 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <span className="font-display text-2xl font-bold uppercase tracking-wide sm:text-3xl">
              Ready for 1st Half
            </span>
          </button>
          {!canStartMatch && startMatchBlockReason ? (
            <p className="text-center text-sm font-semibold text-muted-foreground">
              {startMatchBlockReason}
            </p>
          ) : null}
        </div>
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
  const firstHalfClock = formatMatchClockParts(seconds)
  const firstHalfEndedLabel = firstHalfClock.addedLabel
    ? `${firstHalfClock.regulation} ${firstHalfClock.addedLabel}`
    : firstHalfClock.regulation

  return (
    <main className={APP_SHELL}>
      <div className={`${APP_CONTAINER} space-y-3 pt-4 md:pt-5`}>
        <ScreenHeader
          title="Halftime Setup"
          subtitle={`${teamName.trim() || 'Home'} vs ${opponent.trim() || 'Opponent'} · 1st half ended at ${firstHalfEndedLabel} / ${formatClock(halfLengthMinutes * 60)}`}
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
          constrainLists={false}
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
      </div>

      <div className="sticky bottom-0 z-20 border-t-2 border-border bg-background/95 px-4 pt-3 backdrop-blur supports-[backdrop-filter]:bg-background/90 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6">
        <div className="mx-auto w-full max-w-md md:max-w-2xl lg:max-w-4xl">
          <button
            type="button"
            onClick={onBeginSecondHalf}
            disabled={!canBeginSecondHalf}
            className="flex w-full min-h-14 touch-manipulation items-center justify-center gap-3 rounded-2xl bg-neon py-5 text-neon-foreground shadow-xl shadow-neon/30 transition-transform active:scale-[0.98] active:brightness-95 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <span className="font-display text-2xl font-black uppercase tracking-wide">
              Start 2nd Half
            </span>
          </button>
        </div>
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
      className="w-full min-h-14 touch-manipulation rounded-2xl bg-neon py-5 font-display text-2xl font-black uppercase tracking-wide text-neon-foreground shadow-xl shadow-neon/30 transition-transform active:scale-[0.98] active:brightness-95"
    >
      {label}
    </button>
  )
}

function StickyMatchActionBar({ children }: { children: ReactNode }) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t-2 border-border bg-background/95 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur">
      <div className={`${APP_CONTAINER} space-y-2`}>{children}</div>
    </div>
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
      className="w-full min-h-14 touch-manipulation rounded-2xl bg-orange-600 py-5 font-display text-2xl font-black uppercase tracking-wider text-white shadow-xl shadow-orange-600/40 transition-transform active:scale-[0.98] active:brightness-95"
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
    canAccessClubAdmin,
    canDeleteMatchesForTeam,
    canUseSprocketForTeam,
    role,
    user,
    signOut,
  } = useAuth()

  const {
    loading,
    loadError,
    teams,
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
    activeTeamAgeGroup,
    updateTeamPrimaryCoach,
    activeTeamPrimaryCoachName,
    setupCoachName,
    setSetupCoachName,
    teamCoachingStaff,
    clubStaffCoachNames,
    matchTeamName,
    matchCoachName,
    matchOpponent,
    matchLocationType,
    matchGoesToPks,
    homePkScore,
    setHomePkScore,
    awayPkScore,
    setAwayPkScore,
    pkWinnerIsUs,
    pkGkPlayerId,
    setPkGkPlayerId,
    halfLengthMinutes,
    setHalfLengthMinutes,
    gkPlaysFullHalf,
    setGkPlaysFullHalf,
    subFrequency,
    setSubFrequency,
    setupSubIntervalMinutes,
    setSetupSubIntervalMinutes,
    subIntervalSeconds,
    opponent,
    setOpponent,
    locationType,
    setLocationType,
    tournamentGame,
    setTournamentGame,
    goesToPks,
    setGoesToPks,
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
    finalizePenaltyShootout,
    returnToHome,
    openMatchRecap,
    matchStatus,
    hasLiveMatch,
    hasPendingRecap,
    createTeam,
    updateTeamProfile,
    setTeamActive,
    seasons,
    activeSeason,
    createSeasonRecord,
    updateSeasonRecord,
    activateSeason,
    archiveSeasonRecord,
    addPlayer,
    addGuestFromPool,
    fetchAgeGroupPoolPlayers,
    createPoolPlayer,
    assignPlayerToSeasonRoster,
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

  // Screen stay-awake is armed only from Start 1st/2nd Half click handlers (user gesture).
  const { isActive: wakeLockActive, requestWakeLock } = useWakeLock({
    activeSession:
      ENABLE_WAKE_LOCK &&
      (appMode === 'match' || appMode === 'halftime' || appMode === 'penalty_shootout'),
  })

  const canDeleteMatches = canDeleteMatchesForTeam(activeTeamId)
  const canUseSprocketIntegration = canUseSprocketForTeam(activeTeamId)

  // Club Directors/Staff + this team's assigned coaches only — never free-typed
  // coaches-table orphans (e.g. accidental "Tisan").
  const allCoachNames = useMemo(() => {
    const names = new Set<string>()
    for (const name of clubStaffCoachNames) {
      const trimmed = name.trim()
      if (trimmed) names.add(trimmed)
    }
    for (const name of teamCoachingStaff.headCoaches) names.add(name)
    for (const name of teamCoachingStaff.assistants) names.add(name)
    return [...names].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
  }, [clubStaffCoachNames, teamCoachingStaff])

  const suggestedJersey = nextJerseyNumber(masterRoster)

  const [toast, setToast] = useState<string | null>(null)
  const [pendingReviewMatches, setPendingReviewMatches] = useState<DbMatch[]>([])
  const [recapReturnMode, setRecapReturnMode] = useState<
    'home' | 'recap_history' | 'reporting' | null
  >(null)
  const [goalWizardOpen, setGoalWizardOpen] = useState(false)
  const [goalWizardTeam, setGoalWizardTeam] = useState<GoalWizardTeam>('us')
  const [goalWizardStep, setGoalWizardStep] = useState<GoalWizardStep>('goal_type')
  const [goalIsPk, setGoalIsPk] = useState(false)
  const [goalScorerId, setGoalScorerId] = useState<string | null>(null)
  const [liveDeleteConfirmOpen, setLiveDeleteConfirmOpen] = useState(false)
  const [liveDeleting, setLiveDeleting] = useState(false)
  const [endTimingOpen, setEndTimingOpen] = useState(false)
  const [endingMatch, setEndingMatch] = useState(false)
  const [editDraft, setEditDraft] = useState<PlayerEditDraft | null>(null)
  const [startingMatch, setStartingMatch] = useState(false)
  const [qaSpeedMultiplier, setQaSpeedMultiplier] = useState<QaSpeedMultiplier>(1)
  const [navOpen, setNavOpen] = useState(false)
  const [reportingTab, setReportingTab] = useState<ReportingTab>('matches')

  const teamOptions = useMemo(
    () =>
      teamsForSelector(
        teams.map((team) => ({
          id: team.id,
          name: formatTeamDisplayName(team.name, team.age_group),
          activeStatus: team.active_status !== false,
        })),
      ),
    [teams],
  )

  const teamSwitchDisabled =
    hasLiveMatch ||
    appMode === 'match' ||
    appMode === 'halftime' ||
    appMode === 'penalty_shootout'

  const navItems = useMemo(
    () =>
      buildAppNavItems({
        activeSection: resolveActiveNavSection(appMode, reportingTab),
        teamReady: Boolean(activeTeamId),
        hasLiveMatch,
        showClubAdmin: canAccessClubAdmin,
      }),
    [appMode, reportingTab, activeTeamId, hasLiveMatch, canAccessClubAdmin],
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
            const inPenaltyShootout = shouldResumePenaltyShootout({
              status: 'active',
              period,
              period_clock_started: periodClockStarted,
              home_score: homeScore,
              away_score: awayScore,
              goes_to_pks: matchGoesToPks,
              pk_winner_is_us: pkWinnerIsUs,
            })
            setAppMode(
              inHalftimeSetup
                ? 'halftime'
                : inPenaltyShootout
                  ? 'penalty_shootout'
                  : 'match',
            )
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
        case 'club_admin':
          if (!canAccessClubAdmin) {
            setToast('Club Admin is available to Directors only')
            setAppMode('home')
            break
          }
          setAppMode('club_admin')
          break
      }
    },
    [
      activeTeamId,
      canAccessClubAdmin,
      hasLiveMatch,
      hasPendingRecap,
      matchId,
      halftimeSecondHalf,
      period,
      periodClockStarted,
      homeScore,
      awayScore,
      matchGoesToPks,
      pkWinnerIsUs,
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
      setGoalWizardTeam('us')
      setGoalWizardStep('goal_type')
      setGoalIsPk(false)
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
  const activeTeamName = (() => {
    const team = teams.find((entry) => entry.id === activeTeamId)
    if (!team) return 'Team'
    return formatTeamDisplayName(team.name, team.age_group)
  })()
  const maxFieldPlayers = getMaxFieldPlayers(activeTeamFormat)
  const startMatchBlockReason =
    getSetupLineupBlockReason(setupLineup, maxFieldPlayers) ??
    (!setupCoachName.trim() ||
    !allCoachNames.some((name) => name.toLowerCase() === setupCoachName.trim().toLowerCase())
      ? 'Select a head coach'
      : null)
  const canStartMatch = startMatchBlockReason === null && Boolean(activeTeamId)
  const canBeginSecondHalf = isHalftimeLineupValid(halftimeSecondHalf, maxFieldPlayers)
  const activeFormation = period === '1st' ? matchFormations.first : matchFormations.second

  useEffect(() => {
    if (appMode !== 'match' || !running || !matchId) return
    const id = setInterval(() => {
      setSeconds((s) => tickCountdownClock(s, qaSpeedMultiplier))
    }, 1000)
    return () => clearInterval(id)
  }, [appMode, running, matchId, qaSpeedMultiplier, setSeconds])

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
    const durationMs = toast === WAKE_LOCK_BLOCKED_TOAST ? 5000 : 2200
    const id = setTimeout(() => setToast(null), durationMs)
    return () => clearTimeout(id)
  }, [toast])

  useEffect(() => {
    if (appMode === 'club_admin' && !canAccessClubAdmin) {
      setAppMode('home')
    }
  }, [appMode, canAccessClubAdmin, setAppMode])

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
      const absentPlayers = masterRoster.filter(
        (p) => resolvedLineup.attending[p.id] === false,
      )
      const rotationMinutes = setupSubIntervalMinutes
      await beginMatch({
        teamId: activeTeamId,
        teamName: formatTeamDisplayName(team.name, team.age_group),
        coachName: setupCoachName.trim(),
        opponent,
        locationType,
        tournamentGame,
        goesToPks,
        halfLength: halfLengthMinutes,
        matchDate,
        matchTime,
        attendingPlayers,
        absentPlayers,
        firstHalfStarterIds: getFirstHalfStarterIds(resolvedLineup),
        matchPositions: resolvedMatchPositions,
        firstHalfFormation: matchFormations.first,
        subIntervalSeconds:
          ENABLE_SUB_ASSISTANT && rotationMinutes != null && rotationMinutes > 0
            ? rotationMinutes * 60
            : null,
        gkPlaysFullHalf,
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
    goesToPks,
    halfLengthMinutes,
    matchDate,
    matchTime,
    matchPositions,
    matchFormations,
    gkPlaysFullHalf,
    setupSubIntervalMinutes,
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

  const handleEndGame = useCallback(() => {
    setRunning(false)
    setEndTimingOpen(true)
  }, [setRunning])

  const handleConfirmEndGameTiming = useCallback(
    async (endedOnTime: boolean) => {
      setEndingMatch(true)
      try {
        const enterPks = shouldEnterPenaltyShootout({
          homeScore,
          awayScore,
          goesToPks: matchGoesToPks,
        })
        await finishGame(seconds, { endedOnTime }, { enterPenaltyShootout: enterPks })
        if (matchId && !enterPks) {
          syncMatchRecord(matchId, {
            period_clock_started: false,
            clock_seconds: persistableClockSeconds(seconds),
          })
        }
        setEndTimingOpen(false)
        setToast(
          enterPks
            ? 'Tied regulation — starting penalty shootout'
            : endedOnTime
              ? 'Match complete — ended on time'
              : 'Match complete — added time recorded',
        )
      } catch (err) {
        setToast(err instanceof Error ? err.message : 'Failed to end match')
      } finally {
        setEndingMatch(false)
      }
    },
    [seconds, matchId, finishGame, homeScore, awayScore, matchGoesToPks],
  )

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

    const underwayToast = `1st half underway · ${formatClock(seconds)}`
    if (ENABLE_WAKE_LOCK) {
      // Must run in this click handler — browsers require a user gesture for Wake Lock / NoSleep.
      void requestWakeLock().then((result) => {
        setToast(result.blockedByOs ? WAKE_LOCK_BLOCKED_TOAST : underwayToast)
      })
    } else {
      setToast(underwayToast)
    }
  }, [seconds, matchId, setPlayers, setPeriodClockStarted, setRunning, requestWakeLock])

  const handleEnterHalftime = useCallback(async () => {
    setRunning(false)
    const slotAssignments = livePitchRef.current?.getSlotAssignments()
    await enterHalftime(seconds, slotAssignments)
    if (matchId) {
      syncMatchRecord(matchId, {
        period_clock_started: false,
        clock_seconds: persistableClockSeconds(seconds),
      })
    }
    setToast('Halftime — 2nd half lineup carried over from the field')
  }, [seconds, matchId, enterHalftime, setRunning])

  const handleBeginSecondHalf = useCallback(async () => {
    if (!canBeginSecondHalf) return
    const assignments = halftimeAssignmentsRef.current ?? halftimeSlotAssignments
    const newClock = halfDurationSeconds(halfLengthMinutes)

    const wakePromise =
      ENABLE_WAKE_LOCK
        ? // Must run in this click handler — browsers require a user gesture for Wake Lock / NoSleep.
          requestWakeLock()
        : Promise.resolve({ active: false, blockedByOs: false, usedFallback: false })

    await beginSecondHalf(assignments)
    if (matchId) {
      syncMatchRecord(matchId, {
        period: '2nd',
        clock_seconds: newClock,
        period_clock_started: true,
      })
    }

    const underwayToast = `2nd half underway · ${formatClock(newClock)}`
    const wakeResult = await wakePromise
    setToast(wakeResult.blockedByOs ? WAKE_LOCK_BLOCKED_TOAST : underwayToast)
  }, [
    canBeginSecondHalf,
    halfLengthMinutes,
    matchId,
    beginSecondHalf,
    halftimeSlotAssignments,
    requestWakeLock,
  ])

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
    setGoalWizardTeam('us')
    setGoalWizardStep('goal_type')
    setGoalIsPk(false)
    setGoalScorerId(null)
  }, [])

  const openGoalWizard = useCallback((team: GoalWizardTeam) => {
    setGoalWizardTeam(team)
    setGoalWizardStep('goal_type')
    setGoalIsPk(false)
    setGoalScorerId(null)
    setGoalWizardOpen(true)
  }, [])

  const commitOpponentGoal = useCallback(
    (isPk: boolean) => {
      if (!matchId) return

      const eventTimestamp = elapsedInHalf(seconds, halfLengthMinutes)
      const opponentLabel = matchOpponent.trim() || 'Opponent'

      setAwayScore((current) => {
        const next = current + 1
        syncMatchRecord(matchId, { away_score: next })
        setToast(
          isPk
            ? `Opponent PK · ${opponentLabel} ${next}`
            : `Opponent goal · ${opponentLabel} ${next}`,
        )
        return next
      })

      syncMatchEvent({
        matchId,
        eventType: 'opponent_goal',
        timestamp: eventTimestamp,
        formation: activeFormation,
        isPk,
      })

      setPlayers((prev) => {
        const next = applyPlusMinusDelta(prev, -1)
        if (matchId) syncMatchStats(matchId, next)
        return next
      })
    },
    [matchId, seconds, halfLengthMinutes, activeFormation, matchOpponent, setAwayScore, setPlayers],
  )

  const commitOurGoal = useCallback(
    (scorerId: string, assistPlayerId: string | null, isPk: boolean) => {
      if (!matchId) return

      const scorer = players.find((p) => p.id === scorerId)
      if (!scorer) return
      if (assistPlayerId === scorerId) return

      const eventTimestamp = elapsedInHalf(seconds, halfLengthMinutes)

      setHomeScore((s) => {
        const next = s + 1
        syncMatchRecord(matchId, { home_score: next })
        return next
      })

      syncMatchEvent({
        matchId,
        playerId: scorerId,
        eventType: 'goal',
        timestamp: eventTimestamp,
        formation: activeFormation,
        assistPlayerId: isPk ? null : assistPlayerId,
        isPk,
      })

      setPlayers((prev) => {
        const next = applyPlusMinusDelta(prev, 1)
        if (matchId) syncMatchStats(matchId, next)
        return next
      })

      const assistPlayer =
        !isPk && assistPlayerId ? players.find((p) => p.id === assistPlayerId) : null
      const sidelineMap = buildSidelineNameMap(players.filter((p) => p.attending))
      const scorerLabel = formatPlayerLabel(scorer, sidelineMap)
      const detail = isPk
        ? 'PK'
        : assistPlayer
          ? formatPlayerLabel(assistPlayer, sidelineMap)
          : 'Unassisted'

      setToast(`Goal · ${scorerLabel} (${detail})`)
      closeGoalWizard()
    },
    [
      matchId,
      players,
      seconds,
      halfLengthMinutes,
      activeFormation,
      setHomeScore,
      setPlayers,
      closeGoalWizard,
    ],
  )

  const handleSelectGoalType = useCallback(
    (isPk: boolean) => {
      if (goalWizardTeam === 'opponent') {
        commitOpponentGoal(isPk)
        closeGoalWizard()
        return
      }
      setGoalIsPk(isPk)
      setGoalWizardStep('scorer')
    },
    [goalWizardTeam, commitOpponentGoal, closeGoalWizard],
  )

  const handleSelectGoalScorer = useCallback(
    (player: MatchPlayer) => {
      setGoalScorerId(player.id)
      if (goalIsPk) {
        commitOurGoal(player.id, null, true)
        return
      }
      setGoalWizardStep('assist')
    },
    [goalIsPk, commitOurGoal],
  )

  const handleCompleteGoal = useCallback(
    (assistPlayerId: string | null) => {
      if (!goalScorerId) return
      commitOurGoal(goalScorerId, assistPlayerId, goalIsPk)
    },
    [goalScorerId, goalIsPk, commitOurGoal],
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
        teams={teams.map((team) => ({
          id: team.id,
          name: formatTeamDisplayName(team.name, team.age_group),
        }))}
        activeTeamId={activeTeamId}
        onTeamChange={setActiveTeamId}
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
        onResumeMatch={() => {
          const inPenaltyShootout = shouldResumePenaltyShootout({
            status: 'active',
            period,
            period_clock_started: periodClockStarted,
            home_score: homeScore,
            away_score: awayScore,
            goes_to_pks: matchGoesToPks,
            pk_winner_is_us: pkWinnerIsUs,
          })
          setAppMode(inPenaltyShootout ? 'penalty_shootout' : 'match')
        }}
      />
    )
  }

  if (appMode === 'club_admin') {
    if (!canAccessClubAdmin) {
      return null
    }

    return (
      <ClubAdminScreen
        teams={teams.map((team) => ({
          id: team.id,
          name: team.name,
          ageGroup: team.age_group,
          activeStatus: team.active_status !== false,
        }))}
        reportTeams={teams}
        seasons={seasons}
        activeSeasonId={activeSeason?.id ?? null}
        activeSeason={activeSeason}
        currentUserId={user?.id ?? null}
        onCreateTeam={async (input) => createTeam(input)}
        onUpdateTeam={async (teamId, input) => updateTeamProfile(teamId, input)}
        onArchiveTeam={async (teamId) => {
          await setTeamActive(teamId, false)
        }}
        onRestoreTeam={async (teamId) => {
          await setTeamActive(teamId, true)
        }}
        onCreateSeason={async (input) => createSeasonRecord(input)}
        onUpdateSeason={async (seasonId, input) => updateSeasonRecord(seasonId, input)}
        onActivateSeason={async (seasonId) => activateSeason(seasonId)}
        onArchiveSeason={async (seasonId) => archiveSeasonRecord(seasonId)}
        onCreatePoolPlayer={async (input) => createPoolPlayer(input)}
        onAssignPoolPlayer={async (input) => assignPlayerToSeasonRoster(input)}
        loadAgeGroupPool={fetchAgeGroupPoolPlayers}
        onSetPlayerActive={async (playerId, active) => {
          await setPlayerActive(playerId, active)
        }}
        onBackToHome={() => setAppMode('home')}
        onToast={setToast}
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
          teamHeadCoaches={teamCoachingStaff.headCoaches}
          teamAssistants={teamCoachingStaff.assistants}
          allCoachNames={allCoachNames}
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
          onTournamentGameChange={(value) => {
            setTournamentGame(value)
            if (!value) setGoesToPks(false)
          }}
          goesToPks={goesToPks}
          onGoesToPksChange={setGoesToPks}
          halfLengthMinutes={halfLengthMinutes}
          onHalfLengthChange={setHalfLengthMinutes}
          gkPlaysFullHalf={gkPlaysFullHalf}
          onGkPlaysFullHalfChange={setGkPlaysFullHalf}
          subFrequency={subFrequency}
          onSubFrequencyChange={setSubFrequency}
          onSetupSubIntervalMinutesChange={setSetupSubIntervalMinutes}
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
          guestAgeGroup={resolveTeamAgeGroup(
            teams.find((team) => team.id === activeTeamId)?.age_group,
          )}
          onAddGuestFromPool={async (playerId) => {
            await addGuestFromPool(playerId)
            setToast('Guest player added to this match')
          }}
          loadAgeGroupPool={fetchAgeGroupPoolPlayers}
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
          activeTeamAgeGroup={activeTeamAgeGroup}
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
          primaryCoachName={activeTeamPrimaryCoachName}
          coachOptions={allCoachNames}
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
          canUseSprocketIntegration={canUseSprocketIntegration}
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
          canDeleteMatches={canDeleteMatches}
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

  const handlePkGkPlayerChange = useCallback(
    (playerId: string | null) => {
      setPkGkPlayerId(playerId)
      if (matchId) {
        syncMatchRecord(matchId, { pk_gk_player_id: playerId })
      }
    },
    [matchId, setPkGkPlayerId],
  )

  if (appMode === 'penalty_shootout') {
    return (
      <PenaltyShootoutScreen
        teamName={matchTeamName}
        opponent={matchOpponent}
        regulationHomeScore={homeScore}
        regulationAwayScore={awayScore}
        players={players}
        gkPlayerId={pkGkPlayerId}
        onGkPlayerChange={handlePkGkPlayerChange}
        onRecordAttempt={async ({ round, team, result, playerId }) => {
          if (!matchId) return
          const nextHome =
            team === 'us' && result === 'make' ? homePkScore + 1 : homePkScore
          const nextAway =
            team === 'opponent' && result === 'make' ? awayPkScore + 1 : awayPkScore
          if (team === 'us' && result === 'make') setHomePkScore(nextHome)
          if (team === 'opponent' && result === 'make') setAwayPkScore(nextAway)
          syncMatchEvent({
            matchId,
            eventType: 'pk_attempt',
            timestamp: round,
            formation: matchFormations.second,
            playerId,
            pkResult: result,
            pkTeam: team,
            eventNotes: encodePkAttemptNotes({ result, team, round }),
          })
          syncMatchRecord(matchId, {
            home_pk_score: nextHome,
            away_pk_score: nextAway,
          })
        }}
        onFinalize={async ({ homePkScore: homePk, awayPkScore: awayPk, pkWinnerIsUs: weWon }) => {
          try {
            await finalizePenaltyShootout({
              homePkScore: homePk,
              awayPkScore: awayPk,
              pkWinnerIsUs: weWon,
            })
            setToast(
              weWon
                ? `Won on PKs ${homePk}–${awayPk}`
                : `Lost on PKs ${homePk}–${awayPk}`,
            )
          } catch (err) {
            setToast(err instanceof Error ? err.message : 'Failed to finalize shootout')
          }
        }}
        onBackToHome={() => setAppMode('home')}
      />
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
          homePkScore={homePkScore}
          awayPkScore={awayPkScore}
          pkWinnerIsUs={pkWinnerIsUs}
          halfLengthMinutes={halfLengthMinutes}
          players={players}
          isCompletedMatch={matchStatus === 'completed'}
          onFinalize={() => void handleFinalizeRecap()}
          onDeleteMatch={handleDeleteMatch}
          canDeleteMatches={canDeleteMatches}
          onHome={handleExitRecap}
          onToast={setToast}
        />
      </>
    )
  }

  return (
    <main className={`${APP_SHELL} pb-36 md:pb-40`}>
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
        wakeLockActive={wakeLockActive}
        onHome={() => setAppMode('home')}
        onLogGoal={() => openGoalWizard('us')}
        onOpponentGoal={() => openGoalWizard('opponent')}
        onShareStatTracker={
          matchId ? () => void handleShareStatTracker() : undefined
        }
      />

      <div className={`${APP_CONTAINER} space-y-5 pt-4 md:space-y-6 md:pt-5`}>
        {ENABLE_QA_SPEED ? (
          <QaSpeedControls speed={qaSpeedMultiplier} onSpeedChange={setQaSpeedMultiplier} />
        ) : null}

        {matchId ? <SidelineStatsPanel matchId={matchId} players={players} /> : null}

        {ENABLE_SUB_ASSISTANT ? (
          <SubCountdownTimer
            intervalSeconds={subIntervalSeconds}
            running={running}
            periodClockStarted={periodClockStarted}
          />
        ) : null}

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
      </div>

      <StickyMatchActionBar>
        {!periodClockStarted && period === '1st' ? (
          <PeriodStartButton label="Start 1st Half" onStart={handleStartFirstHalf} />
        ) : periodClockStarted ? (
          <EndPeriodButton
            period={period}
            onEndFirstHalf={() => void handleEnterHalftime()}
            onEndGame={handleEndGame}
          />
        ) : null}
        {canDeleteMatches ? (
          <button
            type="button"
            onClick={() => setLiveDeleteConfirmOpen(true)}
            className="delete-match-action min-h-11 w-full touch-manipulation rounded-xl border-2 border-danger/70 bg-danger/10 py-2.5 text-xs font-bold uppercase tracking-widest text-danger active:scale-[0.98]"
          >
            Delete Game / Clear Match Data
          </button>
        ) : null}
      </StickyMatchActionBar>

      <GoalWizardModal
        open={goalWizardOpen}
        team={goalWizardTeam}
        step={goalWizardStep}
        isPk={goalIsPk}
        players={players}
        scorerId={goalScorerId}
        onSelectGoalType={handleSelectGoalType}
        onSelectScorer={handleSelectGoalScorer}
        onSelectAssist={handleCompleteGoal}
        onClose={closeGoalWizard}
      />

      <DeleteMatchConfirmModal
        open={liveDeleteConfirmOpen && canDeleteMatches}
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

      <EndMatchTimingModal
        open={endTimingOpen}
        remainingSeconds={seconds}
        busy={endingMatch}
        onCancel={() => {
          if (!endingMatch) setEndTimingOpen(false)
        }}
        onEndedOnTime={() => void handleConfirmEndGameTiming(true)}
        onWentToAddedTime={() => void handleConfirmEndGameTiming(false)}
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
        staffRoleLabel={role ? formatAppRoleLabel(role) : null}
        userEmail={user?.email ?? null}
        onSignOut={() => void signOut()}
      />
      <AppNavShell>{renderScreen()}</AppNavShell>
      {toastOverlay}
    </>
  )
}
