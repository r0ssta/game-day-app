import { lazy, useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type MutableRefObject, type ReactNode } from 'react'
import {
  CheckCircle2,
  Goal,
  Loader2,
  Lock,
  Share2,
  Shield,
  SquareAsterisk,
  UserPlus,
  X,
} from 'lucide-react'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { HomeScreen } from '@/components/HomeScreen'
import { SidelineStatsPanel } from '@/components/SidelineStatsPanel'
import { SubbingAssistantPanel } from '@/components/SubbingAssistantPanel'
import { SubCountdownTimer } from '@/components/SubCountdownTimer'
import { BackToHomeButton, ScreenHeader } from '@/components/AppNavigation'
import {
  AppNavDrawer,
  AppNavShell,
  buildAppNavItems,
  resolveActiveNavSection,
  type AppNavSection,
} from '@/components/AppNavDrawer'
import { GlobalTeamSelector } from '@/components/GlobalTeamSelector'
import { ModalSuspense, ScreenSuspense } from '@/components/Spinner'
import { teamsForSelector } from '@/lib/team-context'
import { formatTeamDisplayName } from '@/lib/age-groups'
import { resolveTeamAgeGroup } from '@/lib/season-roster'
import type { ReportingTab } from '@/components/reporting/ReportingTabBar'
import type { GoalWizardStep, GoalWizardTeam } from '@/components/GoalWizardModal'
import {
  LiveTacticalPitch,
  type LiveTacticalPitchHandle,
  type PositionReassignUpdate,
} from '@/components/LiveTacticalPitch'
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
  hasSlotAssignments,
  isHalftimeLineupValid,
} from '@/lib/lineup'
import { resolveSetupLineup } from '@/lib/lineup-presets'
import type { TeamFormat } from '@/lib/team-format'
import type { SubFrequency } from '@/lib/sub-rotation'
import {
  ENABLE_PARENT_HUB,
  ENABLE_QA_SPEED,
  ENABLE_STAT_TRACKER,
  ENABLE_SUB_ASSISTANT,
  ENABLE_WAKE_LOCK,
} from '@/lib/feature-flags'
import {
  buildParentHubUrl,
  shareParentHubLink,
} from '@/lib/parent-hub'
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
  QA_SPEED_MULTIPLIERS,
  tickCountdownClock,
  type QaSpeedMultiplier,
} from '@/lib/match-clock'
import type { RosterProfilePosition } from '@/lib/positions'
import { applyPlusMinusDelta } from '@/lib/plus-minus'
import { buildStatTrackerUrl } from '@/lib/stat-tracker'
import {
  syncMatchRecord,
  ensureStatTrackerToken,
  formatSupabaseError,
  fetchPendingReviewMatchesByTeamId,
} from '@/lib/supabase-api'
import { apiLogCard, apiLogFormation, apiLogGoal, apiLogPeriod, apiLogPkAttempt, apiLogSubstitution, apiLogTeamEvent, formatMatchWriteError } from '@/lib/match-api'
import { AUTH_RECONNECT_TOAST } from '@/lib/auth-session'
import { assertMatchActionOk } from '@/schemas/match-actions'
import { useOptimisticSync } from '@/hooks/useOptimisticSync'
import { useLiveMatchSync } from '@/hooks/useLiveMatchSync'
import { cn } from '@/lib/utils'
import { shouldEnterPenaltyShootout } from '@/lib/penalty-kicks'
import { findActiveOnFieldGoalkeeper } from '@/lib/match-shot-save'
import { removeLastGoalForMatch } from '@/lib/remove-goal'
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
  TotalPeriods,
} from '@/types/match'
import type { LocationType } from '@/lib/match-location'
import { formatVenueLabel } from '@/lib/match-location'
import {
  defaultPeriodLengthMinutes,
  endPeriodButtonLabel,
  formatPeriodLong,
  formatPeriodShort,
  intermissionTitle,
  periodLengthOptions,
  resolveMatchFormatDefaults,
  startNextPeriodButtonLabel,
  startPeriodButtonLabel,
  supportsThreePeriodFormat,
} from '@/lib/match-periods'
import {
  APP_CONTAINER,
  APP_SHELL,
  APP_SHELL_LOCKED,
  MODAL_OVERLAY,
  MODAL_PANEL,
  TOUCH_ICON_BUTTON,
} from '@/lib/layout'

const ReportingScreen = lazy(() =>
  import('@/components/ReportingScreen').then((m) => ({ default: m.ReportingScreen })),
)
const TeamManagementScreen = lazy(() =>
  import('@/components/TeamManagementScreen').then((m) => ({ default: m.TeamManagementScreen })),
)
const PostGameRecap = lazy(() =>
  import('@/components/PostGameRecap').then((m) => ({ default: m.PostGameRecap })),
)
const MatchRecapHistoryScreen = lazy(() =>
  import('@/components/MatchRecapHistoryScreen').then((m) => ({ default: m.MatchRecapHistoryScreen })),
)
const ClubAdminScreen = lazy(() =>
  import('@/components/ClubAdminScreen').then((m) => ({ default: m.ClubAdminScreen })),
)
const PenaltyShootoutScreen = lazy(() =>
  import('@/components/PenaltyShootoutScreen').then((m) => ({ default: m.PenaltyShootoutScreen })),
)
const GoalWizardModal = lazy(() =>
  import('@/components/GoalWizardModal').then((m) => ({ default: m.GoalWizardModal })),
)
const CardWizardModal = lazy(() =>
  import('@/components/CardWizardModal').then((m) => ({ default: m.CardWizardModal })),
)
const DeleteMatchConfirmModal = lazy(() =>
  import('@/components/DeleteMatchConfirmModal').then((m) => ({ default: m.DeleteMatchConfirmModal })),
)
const EndMatchTimingModal = lazy(() =>
  import('@/components/EndMatchTimingModal').then((m) => ({ default: m.EndMatchTimingModal })),
)

function nextJerseyNumber(roster: RosterPlayer[]) {
  const used = new Set(roster.map((p) => p.number).filter((n): n is number => n !== null))
  for (let n = 1; n <= 99; n++) {
    if (!used.has(n)) return n
  }
  return roster.length + 1
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
  homeShots?: number
  awayShots?: number
  homeSaves?: number
  awaySaves?: number
  homeCorners?: number
  awayCorners?: number
  seconds: number
  period: MatchPeriod
  currentPeriod: number
  totalPeriods: TotalPeriods
  halfLengthMinutes: number
  running: boolean
  periodClockStarted: boolean
  /** Staff test match — parents do not see this game. */
  isTest?: boolean
  /** True when Screen Wake Lock is held (keeps display on). */
  wakeLockActive?: boolean
  /** When true, header is already outside the scrollport — no sticky needed. */
  pinned?: boolean
  onHome: () => void
  onLogGoal?: () => void
  onOpponentGoal?: () => void
  onRemoveGoal?: (side: 'home' | 'away') => void
  onLogShot?: (side: 'home' | 'away') => void
  onLogSave?: (side: 'home' | 'away') => void
  onLogCorner?: (side: 'home' | 'away') => void
  onLogCard?: () => void
  onShareStatTracker?: () => void
  /** True while a live-event mutation is still syncing to the match API. */
  syncPending?: boolean
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
  homeShots = 0,
  awayShots = 0,
  homeSaves = 0,
  awaySaves = 0,
  homeCorners = 0,
  awayCorners = 0,
  seconds,
  period: _period,
  currentPeriod,
  totalPeriods,
  halfLengthMinutes,
  running,
  periodClockStarted,
  isTest = false,
  wakeLockActive = false,
  pinned = false,
  onHome,
  onLogGoal,
  onOpponentGoal,
  onRemoveGoal,
  onLogShot,
  onLogSave,
  onLogCorner,
  onLogCard,
  onShareStatTracker,
  syncPending = false,
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
  const showShotSaveActions = Boolean(
    periodClockStarted && onLogShot && onLogSave && onLogCorner,
  )
  const showTeamShotSaveLine =
    homeShots + awayShots + homeSaves + awaySaves + homeCorners + awayCorners > 0 ||
    showShotSaveActions
  const periodBadge = formatPeriodShort(currentPeriod, totalPeriods)
  const periodReadyLabel = formatPeriodLong(currentPeriod, totalPeriods)

  return (
    <header
      className={cn(
        'z-30 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80',
        pinned ? 'relative' : 'sticky top-0',
      )}
    >
      <div className={`${APP_CONTAINER} space-y-2 py-2`}>
        {isTest ? (
          <p className="rounded-lg border border-amber-500/40 bg-amber-500/15 px-3 py-1.5 text-center text-[11px] font-bold uppercase tracking-wide text-amber-200">
            Testing match — hidden from parents
          </p>
        ) : null}
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
            {showGoalActions && onRemoveGoal && homeScore > 0 ? (
              <button
                type="button"
                onClick={() => onRemoveGoal('home')}
                className="mt-1 min-h-8 touch-manipulation rounded-lg border border-neon/30 px-2 py-1 text-[10px] font-black uppercase tracking-wide text-neon active:scale-[0.98]"
              >
                Undo goal
              </button>
            ) : null}
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
                {periodBadge}
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
              {syncPending ? (
                <span
                  className="inline-flex items-center gap-1 text-muted-foreground"
                  title="Saving match event…"
                  aria-label="Saving match event"
                >
                  <Loader2 className="size-3.5 animate-spin" aria-hidden />
                  <span className="size-1.5 rounded-full bg-athletic" aria-hidden />
                </span>
              ) : null}
            </div>
            <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">
              {waitingToStart
                ? `Ready · ${periodReadyLabel} · ${halfReference}`
                : inAddedTime
                  ? 'Added time'
                  : regulationElapsed
                    ? 'Regulation done'
                    : `${halfReference} period`}
            </span>
          </div>

          <div className="min-w-0 flex-1 text-center">
            <p className="truncate text-[9px] font-bold uppercase tracking-widest text-muted-foreground">
              {awayName}
            </p>
            <p className="font-display text-3xl font-black tabular-nums leading-none text-foreground">
              {awayScore}
            </p>
            {showGoalActions && onRemoveGoal && awayScore > 0 ? (
              <button
                type="button"
                onClick={() => onRemoveGoal('away')}
                className="mt-1 min-h-8 touch-manipulation rounded-lg border border-border px-2 py-1 text-[10px] font-black uppercase tracking-wide text-muted-foreground active:scale-[0.98]"
              >
                Undo goal
              </button>
            ) : null}
          </div>
        </div>

        {showTeamShotSaveLine ? (
          <p className="text-center text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Shots {homeShots}–{awayShots}
            <span className="mx-1.5 text-border">·</span>
            Saves {homeSaves}–{awaySaves}
            <span className="mx-1.5 text-border">·</span>
            Corners {homeCorners}–{awayCorners}
          </p>
        ) : null}

        {showGoalActions ? (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <button
                  type="button"
                  onClick={onLogGoal}
                  className="flex min-h-11 w-full touch-manipulation items-center justify-center gap-1.5 rounded-xl bg-neon px-2 py-2.5 font-display text-sm font-black uppercase tracking-wide text-neon-foreground shadow-md shadow-neon/25 active:scale-[0.98]"
                >
                  <Goal className="size-4" strokeWidth={2.5} />
                  Goal
                </button>
                {showShotSaveActions ? (
                  <div className="grid grid-cols-3 gap-1.5">
                    <button
                      type="button"
                      onClick={() => onLogShot?.('home')}
                      className="flex min-h-10 touch-manipulation items-center justify-center rounded-lg border border-border bg-card px-1 py-2 text-[10px] font-black uppercase tracking-wide text-foreground active:scale-[0.98]"
                    >
                      + Shot
                    </button>
                    <button
                      type="button"
                      onClick={() => onLogSave?.('home')}
                      className="flex min-h-10 touch-manipulation items-center justify-center rounded-lg border border-border bg-card px-1 py-2 text-[10px] font-black uppercase tracking-wide text-foreground active:scale-[0.98]"
                    >
                      + Save
                    </button>
                    <button
                      type="button"
                      onClick={() => onLogCorner?.('home')}
                      className="flex min-h-10 touch-manipulation items-center justify-center rounded-lg border border-border bg-card px-1 py-2 text-[10px] font-black uppercase tracking-wide text-foreground active:scale-[0.98]"
                    >
                      + Corner
                    </button>
                  </div>
                ) : null}
              </div>
              <div className="space-y-1.5">
                <button
                  type="button"
                  onClick={onOpponentGoal}
                  className="flex min-h-11 w-full touch-manipulation items-center justify-center gap-1.5 rounded-xl border-2 border-border bg-secondary px-2 py-2.5 font-display text-sm font-black uppercase tracking-wide text-muted-foreground active:scale-[0.98]"
                >
                  <Shield className="size-4" strokeWidth={2.5} />
                  Opp. Goal
                </button>
                {showShotSaveActions ? (
                  <div className="grid grid-cols-3 gap-1.5">
                    <button
                      type="button"
                      onClick={() => onLogShot?.('away')}
                      className="flex min-h-10 touch-manipulation items-center justify-center rounded-lg border border-border bg-card px-1 py-2 text-[10px] font-black uppercase tracking-wide text-foreground active:scale-[0.98]"
                    >
                      + Shot
                    </button>
                    <button
                      type="button"
                      onClick={() => onLogSave?.('away')}
                      className="flex min-h-10 touch-manipulation items-center justify-center rounded-lg border border-border bg-card px-1 py-2 text-[10px] font-black uppercase tracking-wide text-foreground active:scale-[0.98]"
                    >
                      + Save
                    </button>
                    <button
                      type="button"
                      onClick={() => onLogCorner?.('away')}
                      className="flex min-h-10 touch-manipulation items-center justify-center rounded-lg border border-border bg-card px-1 py-2 text-[10px] font-black uppercase tracking-wide text-foreground active:scale-[0.98]"
                    >
                      + Corner
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
            {onLogCard ? (
              <button
                type="button"
                onClick={onLogCard}
                className="flex min-h-11 w-full touch-manipulation items-center justify-center gap-1.5 rounded-xl border-2 border-amber-400/50 bg-amber-400/10 px-2 py-2.5 font-display text-sm font-black uppercase tracking-wide text-amber-700 active:scale-[0.98]"
              >
                <SquareAsterisk className="size-4" strokeWidth={2.5} />
                Log Card
              </button>
            ) : null}
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
  isTestMatch: boolean
  onIsTestMatchChange: (value: boolean) => void
  goesToPks: boolean
  onGoesToPksChange: (value: boolean) => void
  totalPeriods: TotalPeriods
  onTotalPeriodsChange: (value: TotalPeriods) => void
  /** When false, Match Format is locked to 2 halves (non-U9/U10). */
  allowThreePeriods: boolean
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
  onScheduleMatch: () => void
  onStartLiveNow: () => void
  canStartMatch: boolean
  startMatchBlockReason: string | null
  schedulingMatch?: boolean
  startingMatch?: boolean
  attendingCount: number
  lineupPresets: { id: string; preset_name: string }[]
  onLoadLineupPreset: (presetId: string) => void
  onBackToHome: () => void
  onShareParentHub?: () => void
  parentHubUrl?: string | null
  setupSlotAssignments?: Record<string, string | null>
  setupSlotLabelOverrides?: Record<string, string>
  onSetupSlotAssignmentsChange?: (assignments: Record<string, string | null>) => void
  onSetupSlotLabelOverridesChange?: (overrides: Record<string, string>) => void
  setupPitchKey: number
  setupAssignmentsRef: MutableRefObject<Record<string, string | null> | null>
  setupLabelOverridesRef?: MutableRefObject<Record<string, string> | null>
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
  isTestMatch,
  onIsTestMatchChange,
  goesToPks,
  onGoesToPksChange,
  totalPeriods,
  onTotalPeriodsChange,
  allowThreePeriods,
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
  onScheduleMatch,
  onStartLiveNow,
  canStartMatch,
  startMatchBlockReason,
  schedulingMatch,
  startingMatch,
  attendingCount,
  lineupPresets,
  onLoadLineupPreset,
  onBackToHome,
  onShareParentHub,
  parentHubUrl,
  setupSlotAssignments,
  setupSlotLabelOverrides,
  onSetupSlotAssignmentsChange,
  onSetupSlotLabelOverridesChange,
  setupPitchKey,
  setupAssignmentsRef,
  setupLabelOverridesRef,
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
      <div className={`${APP_CONTAINER} space-y-3 pt-4 pb-40 md:pt-5 md:pb-44`}>
        <ScreenHeader
          title="Game Day Setup"
          subtitle={`Pre-game lineup and match details for ${activeTeamName}.`}
          onHome={onBackToHome}
          teamSwitcher={teamSwitcher}
        />

            <p className="rounded-xl border border-neon/30 bg-neon/5 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {activeTeamFormat} format · {maxFieldPlayers} on field
            </p>

            {onShareParentHub && parentHubUrl ? (
              <div className="space-y-2 rounded-xl border-2 border-border bg-card p-3">
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  Parent Team Hub
                </p>
                <p className="break-all font-mono text-xs font-semibold text-foreground">
                  {parentHubUrl}
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => window.open(parentHubUrl, '_blank', 'noopener,noreferrer')}
                    className="flex min-h-12 touch-manipulation items-center justify-center gap-2 rounded-xl border-2 border-neon bg-neon/10 px-3 py-2 text-xs font-bold uppercase tracking-wide text-foreground active:scale-[0.98]"
                  >
                    Open Hub
                  </button>
                  <button
                    type="button"
                    onClick={onShareParentHub}
                    className="flex min-h-12 touch-manipulation items-center justify-center gap-2 rounded-xl border-2 border-border bg-background px-3 py-2 text-xs font-bold uppercase tracking-wide text-foreground active:scale-[0.98]"
                  >
                    <Share2 className="size-4" strokeWidth={2.5} />
                    Share
                  </button>
                </div>
              </div>
            ) : onShareParentHub ? (
              <button
                type="button"
                onClick={onShareParentHub}
                className="flex w-full min-h-12 touch-manipulation items-center justify-center gap-2 rounded-xl border-2 border-border bg-card px-4 py-3 text-sm font-bold uppercase tracking-wide text-foreground active:scale-[0.98]"
              >
                <Share2 className="size-4" strokeWidth={2.5} />
                Share Team Hub
              </button>
            ) : null}

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
                    No players on this team’s season roster yet. Add players in Team Management, or
                    add one below for this match.
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
                  <p className="rounded-xl border border-neon/30 bg-neon/5 px-3 py-2 text-xs font-semibold text-muted-foreground">
                    Starting lineup is empty until you drag players from the bench onto the pitch.
                  </p>
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
                    initialSlotLabelOverrides={setupSlotLabelOverrides}
                    assignmentsResetKey={setupPitchKey}
                    assignmentsRef={setupAssignmentsRef}
                    slotLabelOverridesRef={setupLabelOverridesRef}
                    onSlotAssignmentsChange={onSetupSlotAssignmentsChange}
                    onSlotLabelOverridesChange={onSetupSlotLabelOverridesChange}
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

            <div className="flex items-center justify-between gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3">
              <div className="min-w-0">
                <p className="text-sm font-bold text-foreground">Testing match</p>
                <p className="text-xs text-muted-foreground">
                  Hidden from Parent Hub — no parent alerts
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={isTestMatch}
                aria-label="Testing match"
                onClick={() => onIsTestMatchChange(!isTestMatch)}
                className={cn(
                  'relative h-8 w-14 shrink-0 rounded-full transition-colors',
                  isTestMatch ? 'bg-amber-500' : 'bg-secondary',
                )}
              >
                <span
                  className={cn(
                    'absolute top-1 size-6 rounded-full bg-white shadow transition-transform',
                    isTestMatch ? 'left-7' : 'left-1',
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

            {allowThreePeriods ? (
              <div>
                <p className="mb-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">
                  Match Format
                </p>
                <div
                  role="radiogroup"
                  aria-label="Match format"
                  className="grid grid-cols-2 gap-2"
                >
                  {(
                    [
                      { value: 2 as TotalPeriods, label: '2 Halves' },
                      { value: 3 as TotalPeriods, label: '3 Periods' },
                    ] as const
                  ).map((option) => {
                    const selected = totalPeriods === option.value
                    const locked = tournamentGame
                    return (
                      <button
                        key={option.value}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        disabled={locked && option.value !== 2}
                        onClick={() => {
                          if (locked) return
                          onTotalPeriodsChange(option.value)
                        }}
                        className={cn(
                          'min-h-12 touch-manipulation rounded-xl border-2 px-3 py-2 text-center font-display text-sm font-black uppercase tracking-wide transition active:scale-[0.98]',
                          selected
                            ? 'border-neon bg-neon/15 text-foreground'
                            : 'border-border bg-background text-foreground',
                          locked && option.value !== 2 ? 'cursor-not-allowed opacity-40' : '',
                        )}
                      >
                        {option.label}
                      </button>
                    )
                  })}
                </div>
                {tournamentGame ? (
                  <p className="mt-2 text-xs font-semibold text-muted-foreground">
                    Tournament games use 2 halves.
                  </p>
                ) : (
                  <p className="mt-2 text-xs font-semibold text-muted-foreground">
                    U9/U10 league games typically use 3 periods.
                  </p>
                )}
              </div>
            ) : null}

            <div>
              <label
                htmlFor="period-length"
                className="mb-2 block text-xs font-bold uppercase tracking-widest text-muted-foreground"
              >
                {allowThreePeriods && totalPeriods === 3
                  ? 'Minutes per period'
                  : 'Half length (minutes)'}
              </label>
              <select
                id="period-length"
                value={halfLengthMinutes}
                onChange={(e) => onHalfLengthChange(Number(e.target.value))}
                className="w-full rounded-xl border border-border bg-card px-4 py-3 text-lg font-semibold text-foreground focus:border-neon focus:outline-none focus:ring-2 focus:ring-neon/30"
              >
                {periodLengthOptions(
                  allowThreePeriods && totalPeriods === 3 ? 3 : 2,
                ).map((mins) => (
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
                totalPeriods={allowThreePeriods && totalPeriods === 3 ? 3 : 2}
                attendingCount={attendingCount}
                gkPlaysFullHalf={gkPlaysFullHalf}
                onGkPlaysFullHalfChange={onGkPlaysFullHalfChange}
                subFrequency={subFrequency}
                onSubFrequencyChange={onSubFrequencyChange}
                onIntervalMinutesChange={onSetupSubIntervalMinutesChange}
              />
            ) : null}
      </div>

      <div className="sticky bottom-0 z-20 space-y-2 border-t-2 border-border bg-background/95 px-4 pt-3 backdrop-blur supports-[backdrop-filter]:bg-background/90 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6">
        <div className="mx-auto w-full max-w-md space-y-2 md:max-w-2xl lg:max-w-4xl">
          <button
            type="button"
            onClick={onScheduleMatch}
            disabled={!canStartMatch || schedulingMatch || startingMatch}
            className="flex min-h-14 w-full touch-manipulation items-center justify-center gap-3 rounded-xl bg-neon py-5 text-neon-foreground shadow-lg shadow-neon/20 transition-transform active:scale-[0.98] active:brightness-95 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <span className="font-display text-2xl font-bold uppercase tracking-wide sm:text-3xl">
              {schedulingMatch ? 'Saving…' : 'Schedule Match'}
            </span>
          </button>
          <button
            type="button"
            onClick={onStartLiveNow}
            disabled={!canStartMatch || schedulingMatch || startingMatch}
            className="flex min-h-12 w-full touch-manipulation items-center justify-center gap-2 rounded-xl border-2 border-border bg-card py-3 text-sm font-black uppercase tracking-wide text-foreground disabled:cursor-not-allowed disabled:opacity-40"
          >
            {startingMatch ? 'Starting…' : 'Start Live Now'}
          </button>
          {!canStartMatch && startMatchBlockReason ? (
            <p className="text-center text-sm font-semibold text-muted-foreground">
              {startMatchBlockReason}
            </p>
          ) : (
            <p className="text-center text-xs text-muted-foreground">
              Schedule saves lineup without going live. Start Live Now opens the match screen
              immediately.
            </p>
          )}
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
  endedPeriod: number
  nextPeriod: number
  totalPeriods: TotalPeriods
  players: MatchPlayer[]
  secondHalfFormation: string
  onSetSecondHalfFormation: (formationId: string) => void
  secondHalfStarters: Record<string, boolean>
  initialSlotAssignments?: Record<string, string | null>
  initialSlotLabelOverrides?: Record<string, string>
  assignmentsResetKey: string | number
  halftimeAssignmentsRef: MutableRefObject<Record<string, string | null> | null>
  halftimeLabelOverridesRef?: MutableRefObject<Record<string, string> | null>
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
  endedPeriod,
  nextPeriod,
  totalPeriods,
  players,
  secondHalfFormation,
  onSetSecondHalfFormation,
  secondHalfStarters,
  initialSlotAssignments,
  initialSlotLabelOverrides,
  assignmentsResetKey,
  halftimeAssignmentsRef,
  halftimeLabelOverridesRef,
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
  const title = intermissionTitle(endedPeriod, totalPeriods)
  const endedLabel = formatPeriodLong(endedPeriod, totalPeriods)
  const startNextLabel = startNextPeriodButtonLabel(nextPeriod, totalPeriods)

  return (
    <main className={APP_SHELL}>
      <div className={`${APP_CONTAINER} space-y-3 pt-4 md:pt-5`}>
        <ScreenHeader
          title={title}
          subtitle={`${teamName.trim() || 'Home'} vs ${opponent.trim() || 'Opponent'} · ${endedLabel} ended at ${firstHalfEndedLabel} / ${formatClock(halfLengthMinutes * 60)}`}
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
          title={`${formatPeriodLong(nextPeriod, totalPeriods)} Lineup`}
          formationId={secondHalfFormation}
          onFormationChange={onSetSecondHalfFormation}
          initialSlotAssignments={
            hasSlotAssignments(initialSlotAssignments) ? initialSlotAssignments : undefined
          }
          initialSlotLabelOverrides={initialSlotLabelOverrides}
          assignmentsResetKey={assignmentsResetKey}
          hydrateFromStarters
          assignmentsRef={halftimeAssignmentsRef}
          slotLabelOverridesRef={halftimeLabelOverridesRef}
          constrainLists={false}
          players={attendingPlayers.map((player) => ({
            id: player.id,
            name: formatPlayerFullName(player.firstName, player.lastName),
            shortName: getSidelineName(player, sidelineNameMap),
            number: player.number,
            isGuest: player.isGuest,
            matchPosition: player.matchPosition,
            minutesLabel: formatPlayingTimeBadge(player.totalSecondsPlayed),
            didNotStartFirstHalf: !player.isFirstHalfStarter,
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
              {startNextLabel}
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
  currentPeriod,
  totalPeriods,
  onEndPeriod,
  onEndGame,
}: {
  currentPeriod: number
  totalPeriods: TotalPeriods
  onEndPeriod: () => void
  onEndGame: () => void
}) {
  const isLastPeriod = currentPeriod >= totalPeriods

  return (
    <button
      type="button"
      onClick={isLastPeriod ? onEndGame : onEndPeriod}
      className="w-full min-h-14 touch-manipulation rounded-2xl bg-orange-600 py-5 font-display text-2xl font-black uppercase tracking-wider text-white shadow-xl shadow-orange-600/40 transition-transform active:scale-[0.98] active:brightness-95"
    >
      {endPeriodButtonLabel(currentPeriod, totalPeriods)}
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
    authHealth,
  } = useAuth()

  const {
    loading,
    loadError,
    teams,
    masterRoster,
    appMode,
    setAppMode,
    hydrateLiveMatch,
    resumeLiveMatchScreen,
    persistMatchClock,
    noteLocalMatchMutation,
    claimLocalClock,
    releaseLocalClock,
    shouldSkipLiveHydrate,
    matchId,
    players,
    setPlayers,
    homeScore,
    setHomeScore,
    awayScore,
    setAwayScore,
    homeShots,
    setHomeShots,
    awayShots,
    setAwayShots,
    homeSaves,
    setHomeSaves,
    awaySaves,
    setAwaySaves,
    homeCorners,
    setHomeCorners,
    awayCorners,
    setAwayCorners,
    seconds,
    setSeconds,
    period,
    currentPeriod,
    totalPeriods,
    setTotalPeriods,
    running,
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
    isTestMatch,
    setIsTestMatch,
    matchIsTest,
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
    halftimeSlotLabelOverrides,
    secondHalfSlotAssignments,
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
    setSetupSlotAssignments,
    setupSlotLabelOverrides,
    setSetupSlotLabelOverrides,
    setupPitchKey,
    halftimePitchKey,
    enterHalftime,
    beginNextPeriod,
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
    schedulePreloadedMatch,
    startLiveMatch,
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
  const { syncPending, isPending, run: runSync } = useOptimisticSync()
  const runOptimisticSync = useCallback(
    <T,>(
      work: () => Promise<T>,
      options: {
        onRevert: () => void
        onErrorToast: (err: unknown) => void
        label?: string
        quiet?: boolean
      },
    ) => {
      noteLocalMatchMutation()
      return runSync(work, options)
    },
    [noteLocalMatchMutation, runSync],
  )
  useEffect(() => {
    if (authHealth === 'failed') setToast(AUTH_RECONNECT_TOAST)
  }, [authHealth])
  useLiveMatchSync({
    matchId,
    enabled:
      !loading &&
      matchStatus === 'live' &&
      Boolean(matchId) &&
      (appMode === 'match' || appMode === 'halftime' || appMode === 'penalty_shootout'),
    isBlocked: () => isPending() || shouldSkipLiveHydrate(),
    onHydrate: () =>
      hydrateLiveMatch({
        applyMode: appMode === 'match' || appMode === 'halftime' || appMode === 'penalty_shootout',
      }),
  })
  const failToast = useCallback(
    (fallback: string) => (err: unknown) => {
      setToast(formatMatchWriteError(err, fallback))
    },
    [],
  )
  const [pendingReviewMatches, setPendingReviewMatches] = useState<DbMatch[]>([])
  const [recapReturnMode, setRecapReturnMode] = useState<
    'home' | 'recap_history' | 'reporting' | null
  >(null)
  const [goalWizardOpen, setGoalWizardOpen] = useState(false)
  const [goalWizardTeam, setGoalWizardTeam] = useState<GoalWizardTeam>('us')
  const [goalWizardStep, setGoalWizardStep] = useState<GoalWizardStep>('goal_type')
  const [goalIsPk, setGoalIsPk] = useState(false)
  const [goalScorerId, setGoalScorerId] = useState<string | null>(null)
  const [cardWizardOpen, setCardWizardOpen] = useState(false)
  const [liveDeleteConfirmOpen, setLiveDeleteConfirmOpen] = useState(false)
  const [liveDeleting, setLiveDeleting] = useState(false)
  const [endTimingOpen, setEndTimingOpen] = useState(false)
  const [endingMatch, setEndingMatch] = useState(false)
  const [editDraft, setEditDraft] = useState<PlayerEditDraft | null>(null)
  const [startingMatch, setStartingMatch] = useState(false)
  const [schedulingMatch, setSchedulingMatch] = useState(false)
  const [startingLiveMatchId, setStartingLiveMatchId] = useState<string | null>(null)
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
      disabledReason={teamSwitchDisabled ? 'Team locked during the live match' : undefined}
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
            void resumeLiveMatchScreen()
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
      resumeLiveMatchScreen,
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
  const setupLabelOverridesRef = useRef<Record<string, string> | null>(null)
  const halftimeAssignmentsRef = useRef<Record<string, string | null> | null>(null)
  const halftimeLabelOverridesRef = useRef<Record<string, string> | null>(null)

  const clockSyncRef = useRef(seconds)

  useEffect(() => {
    clockSyncRef.current = seconds
  }, [seconds])

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
  const activeTeamSlug =
    teams.find((entry) => entry.id === activeTeamId)?.slug?.trim() || null

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
    if (appMode !== 'match' || !matchId) return
    if (!running && !periodClockStarted) return
    const id = setInterval(() => {
      setSeconds((s) => {
        const next = tickCountdownClock(s, qaSpeedMultiplier)
        clockSyncRef.current = next
        return next
      })
    }, 1000)
    return () => clearInterval(id)
  }, [appMode, running, periodClockStarted, matchId, qaSpeedMultiplier, setSeconds])

  useEffect(() => {
    if (appMode !== 'match' || !matchId) return
    if (!running && !periodClockStarted) return
    const id = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return
      if (isPending()) return
      persistMatchClock(matchId, clockSyncRef.current)
    }, 5000)
    return () => clearInterval(id)
  }, [appMode, matchId, running, periodClockStarted, persistMatchClock, isPending])

  useEffect(() => {
    if (!toast) return
    const durationMs =
      toast === WAKE_LOCK_BLOCKED_TOAST ||
      toast === AUTH_RECONNECT_TOAST ||
      toast.startsWith('Parent alerts')
        ? 5000
        : 2200
    const id = setTimeout(() => setToast(null), durationMs)
    return () => clearTimeout(id)
  }, [toast])

  useEffect(() => {
    const onPushResult = (event: Event) => {
      const detail = (
        event as CustomEvent<{
          ok?: boolean
          recipients?: number
          sent?: number
          failed?: number
          status?: number
        }>
      ).detail
      if (!detail) return
      if (!detail.ok) {
        if (detail.status === 429) {
          setToast('Slow down — too many match updates. Try again in a few seconds.')
          return
        }
        setToast(`Parent alerts failed to send (${detail.status ?? 'error'})`)
        return
      }
      if ((detail.recipients ?? 0) === 0) {
        setToast(
          'Parent alerts: no devices subscribed — open Hub on the phone and tap Enable Alerts',
        )
        return
      }
      if ((detail.sent ?? 0) === 0 && (detail.failed ?? 0) > 0) {
        setToast('Parent alerts: delivery failed — tap Reconnect alerts on the Hub')
      }
    }
    window.addEventListener('vvfc-web-push-result', onPushResult)
    return () => window.removeEventListener('vvfc-web-push-result', onPushResult)
  }, [])

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

  // U9/U10 league → 3 periods; tournament / older ages → 2 halves.
  useEffect(() => {
    if (appMode !== 'match_setup') return
    const format = resolveMatchFormatDefaults({
      tournamentGame,
      ageGroup: activeTeamAgeGroup,
      teamFormat: activeTeamFormat,
    })
    setTotalPeriods(format.totalPeriods)
    setHalfLengthMinutes(format.periodLengthMinutes)
  }, [
    appMode,
    activeTeamId,
    activeTeamAgeGroup,
    activeTeamFormat,
    tournamentGame,
    setTotalPeriods,
    setHalfLengthMinutes,
  ])

  const buildSetupMatchPayload = useCallback(() => {
    if (!activeTeamId) return null
    const team = teams.find((t) => t.id === activeTeamId)
    if (!team) return null

    const resolvedLineup = resolveSetupLineup(setupLineup, setupAssignmentsRef.current)
    const slotAssignments = setupAssignmentsRef.current
    const labelOverrides = setupLabelOverridesRef.current
    const resolvedMatchPositions =
      slotAssignments && Object.values(slotAssignments).some(Boolean)
        ? {
            ...matchPositions,
            ...matchPositionsFromSlotAssignments(
              slotAssignments,
              matchFormations.first,
              activeTeamFormat,
              labelOverrides,
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
    const allowsThree = supportsThreePeriodFormat({
      ageGroup: team.age_group,
      teamFormat: activeTeamFormat,
    })
    const matchTotalPeriods =
      tournamentGame || !allowsThree ? 2 : totalPeriods === 3 ? 3 : 2

    return {
      teamId: activeTeamId,
      teamName: formatTeamDisplayName(team.name, team.age_group),
      coachName: setupCoachName.trim(),
      opponent,
      locationType,
      tournamentGame,
      isTest: isTestMatch,
      goesToPks,
      halfLength: halfLengthMinutes,
      totalPeriods: matchTotalPeriods as 2 | 3,
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
    }
  }, [
    activeTeamId,
    teams,
    setupLineup,
    matchPositions,
    matchFormations.first,
    activeTeamFormat,
    masterRoster,
    setupSubIntervalMinutes,
    tournamentGame,
    isTestMatch,
    totalPeriods,
    setupCoachName,
    opponent,
    locationType,
    goesToPks,
    halfLengthMinutes,
    matchDate,
    matchTime,
    gkPlaysFullHalf,
  ])

  const handleScheduleMatch = useCallback(async () => {
    if (!canStartMatch || schedulingMatch || startingMatch) return
    const payload = buildSetupMatchPayload()
    if (!payload) return

    setSchedulingMatch(true)
    try {
      await schedulePreloadedMatch(payload)
      setQaSpeedMultiplier(1)
      setToast('Match scheduled — use Get Ready for Game on Home when it is time')
    } catch (err) {
      setToast(formatSupabaseError(err))
    } finally {
      setSchedulingMatch(false)
    }
  }, [
    canStartMatch,
    schedulingMatch,
    startingMatch,
    buildSetupMatchPayload,
    schedulePreloadedMatch,
  ])

  const handleStartMatch = useCallback(async () => {
    if (!canStartMatch || startingMatch || schedulingMatch) return
    const payload = buildSetupMatchPayload()
    if (!payload) return

    setStartingMatch(true)
    try {
      await beginMatch(payload)
      setQaSpeedMultiplier(1)
      setToast(`Live match ready · ${formatPeriodLong(1, payload.totalPeriods)}`)
    } catch (err) {
      setToast(formatSupabaseError(err))
    } finally {
      setStartingMatch(false)
    }
  }, [
    canStartMatch,
    startingMatch,
    schedulingMatch,
    buildSetupMatchPayload,
    beginMatch,
  ])

  const handleStartLiveScheduledMatch = useCallback(
    async (scheduledMatchId: string) => {
      if (hasLiveMatch || startingLiveMatchId) return
      setStartingLiveMatchId(scheduledMatchId)
      try {
        const opened = await startLiveMatch(scheduledMatchId)
        setToast(`Ready for ${formatPeriodLong(1, opened.totalPeriods)}`)
      } catch (err) {
        setToast(formatSupabaseError(err))
      } finally {
        setStartingLiveMatchId(null)
      }
    },
    [hasLiveMatch, startingLiveMatchId, startLiveMatch],
  )

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
    releaseLocalClock()
    setEndTimingOpen(true)
  }, [releaseLocalClock])

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
    [seconds, finishGame, homeScore, awayScore, matchGoesToPks],
  )

  const handleStartFirstHalf = useCallback(() => {
    const stamped = stampAllOnField(players, seconds)
    setPlayers(stamped)
    setPeriodClockStarted(true)
    claimLocalClock()
    noteLocalMatchMutation()

    const sidelineMap = buildSidelineNameMap(stamped.filter((p) => p.attending))
    const starters = stamped.filter((p) => p.attending && p.isOnField)

    if (matchId) {
      persistMatchClock(matchId, seconds)
      void runOptimisticSync(
        async () => {
          assertMatchActionOk(
            await apiLogPeriod({
              matchId,
              kind: 'start',
              period: currentPeriod,
              totalPeriods,
              clockSeconds: seconds,
              halfLengthMinutes,
              formation: activeFormation,
              teamName: matchTeamName.trim() || 'Home',
              opponent: matchOpponent,
              teamSlug: activeTeamSlug,
              insertStarterEvents: false,
              starters: starters.map((p) => ({
                playerId: p.id,
                label: formatPlayerLabel(p, sidelineMap),
                matchPosition: p.matchPosition,
                subbedInAt: p.subbedInAt,
                totalSecondsPlayed: p.totalSecondsPlayed,
              })),
              onFieldPlayers: [],
            }),
          )
        },
        {
          onRevert: () => {},
          onErrorToast: () => setToast('Could not sync period start — try again'),
          label: 'first-period-start',
        },
      )
    }

    const underwayToast = `${formatPeriodLong(currentPeriod, totalPeriods)} underway · ${formatClock(seconds)}`
    if (ENABLE_WAKE_LOCK) {
      // Must run in this click handler — browsers require a user gesture for Wake Lock / NoSleep.
      void requestWakeLock().then((result) => {
        setToast(result.blockedByOs ? WAKE_LOCK_BLOCKED_TOAST : underwayToast)
      })
    } else {
      setToast(underwayToast)
    }
  }, [
    seconds,
    matchId,
    setPlayers,
    setPeriodClockStarted,
    claimLocalClock,
    requestWakeLock,
    currentPeriod,
    totalPeriods,
    halfLengthMinutes,
    players,
    matchTeamName,
    matchOpponent,
    activeTeamSlug,
    activeFormation,
    setToast,
    persistMatchClock,
    noteLocalMatchMutation,
    runOptimisticSync,
  ])

  const handleEnterHalftime = useCallback(async () => {
    releaseLocalClock()
    const slotAssignments = livePitchRef.current?.getSlotAssignments()
    const slotLabelOverrides = livePitchRef.current?.getSlotLabelOverrides()
    const onFieldBefore = players
      .filter((p) => p.attending && p.isOnField)
      .map((p) => p.id)
    const endedPeriod = currentPeriod
    const endedFormation = activeFormation

    const nextPlayers = await enterHalftime(seconds, slotAssignments, slotLabelOverrides)
    const onFieldPlayers = onFieldBefore.map((playerId) => {
      const player = nextPlayers.find((p) => p.id === playerId)
      return {
        playerId,
        totalSecondsPlayed: player?.totalSecondsPlayed ?? 0,
      }
    })

    if (matchId) {
      await runOptimisticSync(
        async () => {
          assertMatchActionOk(
            await apiLogPeriod({
              matchId,
              kind: 'end',
              period: endedPeriod,
              totalPeriods,
              clockSeconds: seconds,
              halfLengthMinutes,
              formation: endedFormation,
              teamName: matchTeamName.trim() || 'Home',
              opponent: matchOpponent,
              teamSlug: activeTeamSlug,
              homeScore,
              awayScore,
              insertStarterEvents: false,
              starters: [],
              onFieldPlayers,
            }),
          )
        },
        {
          onRevert: () => {},
          onErrorToast: () => setToast('Could not sync period end — try again'),
          label: 'period-end',
        },
      )
    }

    const next = Math.min(totalPeriods, endedPeriod + 1)
    setToast(
      `${formatPeriodLong(endedPeriod, totalPeriods)} ended — set ${formatPeriodLong(next, totalPeriods)} lineup`,
    )
  }, [
    seconds,
    matchId,
    enterHalftime,
    releaseLocalClock,
    currentPeriod,
    totalPeriods,
    halfLengthMinutes,
    players,
    matchTeamName,
    matchOpponent,
    activeTeamSlug,
    activeFormation,
    homeScore,
    awayScore,
    setToast,
    runOptimisticSync,
  ])

  const handleBeginSecondHalf = useCallback(async () => {
    if (!canBeginSecondHalf) return
    const assignments = hasSlotAssignments(halftimeAssignmentsRef.current)
      ? halftimeAssignmentsRef.current
      : hasSlotAssignments(halftimeSlotAssignments)
        ? halftimeSlotAssignments
        : undefined
    const labelOverrides = halftimeLabelOverridesRef.current
    const newClock = halfDurationSeconds(halfLengthMinutes)

    const wakePromise =
      ENABLE_WAKE_LOCK
        ? // Must run in this click handler — browsers require a user gesture for Wake Lock / NoSleep.
          requestWakeLock()
        : Promise.resolve({ active: false, blockedByOs: false, usedFallback: false })

    // Block live-sync hydrate until the period-start write lands — otherwise a
    // snapshot taken after period end (everyone benched) overwrites the kickoff.
    const started = await runOptimisticSync(
      async () => {
        const next = await beginNextPeriod(assignments, labelOverrides)
        if (matchId) {
          const sidelineMap = buildSidelineNameMap(
            players.filter((p) => p.attending).concat(next.starters),
          )
          assertMatchActionOk(
            await apiLogPeriod({
              matchId,
              kind: 'start',
              period: next.period,
              totalPeriods,
              clockSeconds: next.clockSeconds,
              halfLengthMinutes,
              formation: next.formation,
              periodCode: next.periodCode,
              teamName: matchTeamName.trim() || 'Home',
              opponent: matchOpponent,
              teamSlug: activeTeamSlug,
              insertStarterEvents: true,
              starters: next.starters.map((p) => ({
                playerId: p.id,
                label: formatPlayerLabel(p, sidelineMap),
                matchPosition: p.matchPosition,
                subbedInAt: p.subbedInAt,
                totalSecondsPlayed: p.totalSecondsPlayed,
              })),
              onFieldPlayers: [],
            }),
          )
        }
        return next
      },
      {
        onRevert: () => {},
        onErrorToast: () => setToast('Could not sync period start — try again'),
        label: 'period-start',
      },
    )

    const wakeResult = await wakePromise
    if (!started) return
    const underwayToast = `${formatPeriodLong(started.period, totalPeriods)} underway · ${formatClock(newClock)}`
    setToast(wakeResult.blockedByOs ? WAKE_LOCK_BLOCKED_TOAST : underwayToast)
  }, [
    canBeginSecondHalf,
    halfLengthMinutes,
    beginNextPeriod,
    halftimeSlotAssignments,
    players,
    requestWakeLock,
    totalPeriods,
    matchId,
    activeTeamSlug,
    matchTeamName,
    matchOpponent,
    setToast,
    runOptimisticSync,
  ])

  const handleShareParentHub = useCallback(async () => {
    if (!activeTeamSlug) {
      setToast('Team Hub link is not ready yet')
      return
    }
    try {
      const result = await shareParentHubLink(activeTeamSlug, activeTeamName)
      setToast(result === 'shared' ? 'Team Hub shared' : 'Team Hub link copied')
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      setToast(err instanceof Error ? err.message : 'Could not share Team Hub link')
    }
  }, [activeTeamSlug, activeTeamName])

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
      const previousFormationId = activeFormation
      const previousLabel = getFormationLabel(activeFormation)
      const nextLabel = getFormationLabel(nextFormationId)
      const previousPlayers = players

      setActiveFormation(nextFormationId)

      let nextPlayers = players
      if (remap.positionUpdates.length > 0 || remap.overflowPlayerIds.length > 0) {
        nextPlayers = players.map((player) => {
          const update = remap.positionUpdates.find((u) => u.playerId === player.id)
          return update ? { ...player, matchPosition: update.position } : player
        })
        for (const playerId of remap.overflowPlayerIds) {
          nextPlayers = applySubOut(nextPlayers, playerId, seconds)
        }
        setPlayers(nextPlayers)
      }

      const overflowNote =
        remap.overflowPlayerIds.length > 0
          ? ` · ${remap.overflowPlayerIds.length} to bench`
          : ''
      setToast(`Formation · ${nextLabel}${overflowNote}`)

      void runOptimisticSync(
        async () => {
          assertMatchActionOk(
            await apiLogFormation({
              matchId,
              kind: 'switch',
              timestamp: eventTimestamp,
              formation: nextFormationId,
              previousLabel,
              nextLabel,
              positionUpdates: remap.positionUpdates,
              overflowPlayers: remap.overflowPlayerIds.map((playerId) => {
                const player = nextPlayers.find((p) => p.id === playerId)
                return {
                  playerId,
                  totalSecondsPlayed: player?.totalSecondsPlayed ?? 0,
                }
              }),
            }),
          )
        },
        {
          label: 'handleLiveFormationSwitch',
          onRevert: () => {
            setActiveFormation(previousFormationId)
            setPlayers(previousPlayers)
          },
          onErrorToast: failToast('Could not save formation — try again'),
        },
      )
    },
    [
      matchId,
      seconds,
      halfLengthMinutes,
      activeFormation,
      players,
      setActiveFormation,
      setPlayers,
      runOptimisticSync,
    ],
  )

  const handleLiveReassignPosition = useCallback(
    (updates: PositionReassignUpdate[]) => {
      if (!matchId || updates.length === 0) return
      const eventTimestamp = elapsedInHalf(seconds, halfLengthMinutes)
      const previousPlayers = players

      const nextPlayers = players.map((player) => {
        const update = updates.find((u) => u.playerId === player.id)
        return update ? { ...player, matchPosition: update.position } : player
      })
      setPlayers(nextPlayers)

      const labels = updates.map((u) => u.position).join(' · ')
      setToast(`Position · ${labels}`)

      void runOptimisticSync(
        async () => {
          assertMatchActionOk(
            await apiLogFormation({
              matchId,
              kind: 'reassign',
              timestamp: eventTimestamp,
              formation: activeFormation,
              positionUpdates: updates,
              overflowPlayers: [],
            }),
          )
        },
        {
          label: 'handleLiveReassignPosition',
          onRevert: () => setPlayers(previousPlayers),
          onErrorToast: failToast('Could not save positions — try again'),
        },
      )
    },
    [matchId, seconds, halfLengthMinutes, activeFormation, players, setPlayers, runOptimisticSync],
  )

  const handleLiveSubIn = useCallback(
    (benchId: string, tacticalPosition: string) => {
      if (!matchId) return
      const bench = players.find((p) => p.id === benchId)
      if (!bench || bench.isSentOff) return
      const onFieldCount = players.filter((p) => p.attending && p.isOnField).length
      if (onFieldCount >= maxFieldPlayers) return

      const eventTimestamp = elapsedInHalf(seconds, halfLengthMinutes)
      const sidelineMap = buildSidelineNameMap(players.filter((p) => p.attending))
      const previousPlayers = players

      const next = applySubIn(players, benchId, seconds).map((p) =>
        p.id === benchId ? { ...p, matchPosition: tacticalPosition } : p,
      )
      const benchPlayer = next.find((p) => p.id === benchId)
      if (!benchPlayer) return

      setPlayers(next)
      const label = formatPlayerLabel(benchPlayer, sidelineMap)
      setToast(`Sub in · ${label}`)

      void runOptimisticSync(
        async () => {
          assertMatchActionOk(
            await apiLogSubstitution({
              matchId,
              kind: 'in',
              timestamp: eventTimestamp,
              formation: activeFormation,
              benchPlayerId: benchPlayer.id,
              tacticalPosition,
              benchSubbedInAt: benchPlayer.subbedInAt,
              benchPlayerLabel: label,
              currentPeriod,
              totalPeriods,
              teamSlug: activeTeamSlug,
            }),
          )
        },
        {
          label: 'handleLiveSubIn',
          onRevert: () => setPlayers(previousPlayers),
          onErrorToast: failToast('Could not save sub — try again'),
        },
      )
    },
    [
      matchId,
      players,
      seconds,
      halfLengthMinutes,
      activeFormation,
      maxFieldPlayers,
      setPlayers,
      currentPeriod,
      totalPeriods,
      activeTeamSlug,
      runOptimisticSync,
      setToast,
    ],
  )

  const handleLiveSubOut = useCallback(
    (fieldId: string) => {
      if (!matchId) return
      const eventTimestamp = elapsedInHalf(seconds, halfLengthMinutes)
      const sidelineMap = buildSidelineNameMap(players.filter((p) => p.attending))
      const previousPlayers = players

      const next = applySubOut(players, fieldId, seconds)
      const fieldPlayer = next.find((p) => p.id === fieldId)
      if (!fieldPlayer) return

      setPlayers(next)
      const label = formatPlayerLabel(fieldPlayer, sidelineMap)
      setToast(`Sub out · ${label}`)

      void runOptimisticSync(
        async () => {
          assertMatchActionOk(
            await apiLogSubstitution({
              matchId,
              kind: 'out',
              timestamp: eventTimestamp,
              formation: activeFormation,
              fieldPlayerId: fieldPlayer.id,
              fieldTotalSecondsPlayed: fieldPlayer.totalSecondsPlayed,
              fieldPlayerLabel: label,
              currentPeriod,
              totalPeriods,
              teamSlug: activeTeamSlug,
            }),
          )
        },
        {
          label: 'handleLiveSubOut',
          onRevert: () => setPlayers(previousPlayers),
          onErrorToast: failToast('Could not save sub — try again'),
        },
      )
    },
    [
      matchId,
      players,
      seconds,
      halfLengthMinutes,
      activeFormation,
      setPlayers,
      currentPeriod,
      totalPeriods,
      activeTeamSlug,
      runOptimisticSync,
      setToast,
    ],
  )

  const handleLiveSwap = useCallback(
    (benchId: string, fieldId: string, tacticalPosition: string) => {
      if (!matchId) return
      const bench = players.find((p) => p.id === benchId)
      if (!bench || bench.isSentOff) return
      const eventTimestamp = elapsedInHalf(seconds, halfLengthMinutes)
      const sidelineMap = buildSidelineNameMap(players.filter((p) => p.attending))
      const previousPlayers = players

      const next = applySubstitution(players, benchId, fieldId, seconds).map((p) =>
        p.id === benchId ? { ...p, matchPosition: tacticalPosition } : p,
      )
      const benchPlayer = next.find((p) => p.id === benchId)
      const fieldPlayer = next.find((p) => p.id === fieldId)
      if (!benchPlayer || !fieldPlayer) return

      setPlayers(next)
      const onLabel = formatPlayerLabel(benchPlayer, sidelineMap)
      const offLabel = formatPlayerLabel(fieldPlayer, sidelineMap)
      setToast(`Sub · ${onLabel} for ${offLabel}`)

      void runOptimisticSync(
        async () => {
          assertMatchActionOk(
            await apiLogSubstitution({
              matchId,
              kind: 'swap',
              timestamp: eventTimestamp,
              formation: activeFormation,
              benchPlayerId: benchPlayer.id,
              fieldPlayerId: fieldPlayer.id,
              tacticalPosition,
              benchSubbedInAt: benchPlayer.subbedInAt,
              fieldTotalSecondsPlayed: fieldPlayer.totalSecondsPlayed,
              benchPlayerLabel: onLabel,
              fieldPlayerLabel: offLabel,
              currentPeriod,
              totalPeriods,
              teamSlug: activeTeamSlug,
            }),
          )
        },
        {
          label: 'handleLiveSwap',
          onRevert: () => setPlayers(previousPlayers),
          onErrorToast: failToast('Could not save sub — try again'),
        },
      )
    },
    [
      matchId,
      players,
      seconds,
      halfLengthMinutes,
      activeFormation,
      setPlayers,
      currentPeriod,
      totalPeriods,
      activeTeamSlug,
      runOptimisticSync,
      setToast,
    ],
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

  const handleConfirmCard = useCallback(
    (playerId: string, kind: 'yellow' | 'red') => {
      if (!matchId) return
      const player = players.find((p) => p.id === playerId)
      if (!player || player.isSentOff) {
        setCardWizardOpen(false)
        return
      }

      const sidelineMap = buildSidelineNameMap(players.filter((p) => p.attending))
      const label = formatPlayerLabel(player, sidelineMap)
      const eventTimestamp = elapsedInHalf(seconds, halfLengthMinutes)

      const isSecondYellow = kind === 'yellow' && player.yellowCardCount >= 1
      if (isSecondYellow) {
        const confirmed = window.confirm(
          'Second Yellow. This results in a Red Card and the player will be sent off. Confirm?',
        )
        if (!confirmed) return
      }

      const issueRed = kind === 'red' || isSecondYellow
      const wasOnField = player.isOnField
      setCardWizardOpen(false)

      const previousPlayers = players
      let nextPlayers = players.map((p) => {
        if (p.id !== playerId) return p
        if (issueRed) {
          return {
            ...p,
            yellowCardCount: isSecondYellow
              ? Math.max(2, p.yellowCardCount + 1)
              : p.yellowCardCount,
            isSentOff: true,
          }
        }
        return { ...p, yellowCardCount: p.yellowCardCount + 1 }
      })

      if (issueRed) {
        if (wasOnField) {
          nextPlayers = applySubOut(nextPlayers, playerId, seconds).map((p) =>
            p.id === playerId ? { ...p, isSentOff: true } : p,
          )
        } else {
          nextPlayers = nextPlayers.map((p) =>
            p.id === playerId ? { ...p, isOnField: false, isSentOff: true } : p,
          )
        }
      }

      setPlayers(nextPlayers)
      if (issueRed) {
        setToast(
          isSecondYellow
            ? `2nd yellow → Red · ${label} sent off`
            : `Red card · ${label} sent off`,
        )
      } else {
        setToast(`Yellow card · ${label}`)
      }

      const updated = nextPlayers.find((p) => p.id === playerId)

      void runOptimisticSync(
        async () => {
          assertMatchActionOk(
            await apiLogCard({
              matchId,
              playerId,
              kind,
              timestamp: eventTimestamp,
              formation: activeFormation,
              yellowCardCountBefore: player.yellowCardCount,
              isOnField: wasOnField,
              totalSecondsPlayed: updated?.totalSecondsPlayed,
              playerLabel: label,
              teamSlug: activeTeamSlug,
            }),
          )
        },
        {
          label: 'handleConfirmCard',
          onRevert: () => setPlayers(previousPlayers),
          onErrorToast: failToast('Could not save card — try again'),
        },
      )
    },
    [
      matchId,
      players,
      seconds,
      halfLengthMinutes,
      activeFormation,
      setPlayers,
      activeTeamSlug,
      runOptimisticSync,
      setToast,
    ],
  )

  const logTeamShot = useCallback(
    (
      side: 'home' | 'away',
      options?: {
        silent?: boolean
        timestamp?: number
        /** When false, skip network (used when goal API already paired the shot). */
        persist?: boolean
      },
    ) => {
      if (!matchId || !periodClockStarted) return
      const eventTimestamp =
        options?.timestamp ?? elapsedInHalf(seconds, halfLengthMinutes)
      if (side === 'home') {
        setHomeShots((n) => n + 1)
      } else {
        setAwayShots((n) => n + 1)
      }
      if (options?.persist === false) {
        if (!options?.silent) {
          setToast(side === 'home' ? 'Shot · Home' : 'Shot · Away')
        }
        return
      }
      if (!options?.silent) {
        setToast(side === 'home' ? 'Shot · Home' : 'Shot · Away')
      }
      void runOptimisticSync(
        async () => {
          assertMatchActionOk(
            await apiLogTeamEvent({
              matchId,
              side,
              eventKind: 'shot',
              timestamp: eventTimestamp,
              formation: activeFormation,
              pairAutoShot: false,
            }),
          )
        },
        {
          label: 'logTeamShot',
          quiet: true,
          onRevert: () => {
            if (side === 'home') setHomeShots((n) => Math.max(0, n - 1))
            else setAwayShots((n) => Math.max(0, n - 1))
          },
          onErrorToast: failToast('Could not save shot — try again'),
        },
      )
    },
    [
      matchId,
      periodClockStarted,
      seconds,
      halfLengthMinutes,
      activeFormation,
      setHomeShots,
      setAwayShots,
      setToast,
      runOptimisticSync,
    ],
  )

  const commitTeamShot = useCallback(
    (side: 'home' | 'away') => logTeamShot(side),
    [logTeamShot],
  )

  const removeLastGoal = useCallback(
    async (side: 'home' | 'away') => {
      if (!matchId) return

      try {
        const result = await removeLastGoalForMatch(matchId, side)
        setHomeScore(result.homeScore)
        setAwayScore(result.awayScore)

        if (result.removedPairedShot) {
          if (side === 'home') setHomeShots((n) => Math.max(0, n - 1))
          else setAwayShots((n) => Math.max(0, n - 1))
        }

        if (appMode === 'match') {
          setPlayers((prev) => applyPlusMinusDelta(prev, side === 'home' ? -1 : 1))
        }

        setToast(side === 'home' ? 'Removed our goal' : 'Removed opponent goal')
      } catch (err) {
        console.error('[removeLastGoal]', err)
        setToast(
          formatMatchWriteError(
            err,
            err instanceof Error && err.message === 'No goal to remove'
              ? 'No goal to remove'
              : 'Could not remove goal — try again',
          ),
        )
      }
    },
    [matchId, appMode, setHomeScore, setAwayScore, setHomeShots, setAwayShots, setPlayers, setToast],
  )

  const commitOpponentGoal = useCallback(
    (isPk: boolean) => {
      if (!matchId) return

      const eventTimestamp = elapsedInHalf(seconds, halfLengthMinutes)
      const opponentLabel = matchOpponent.trim() || 'Opponent'
      const onFieldPlayerIds = players
        .filter((p) => p.attending && p.isOnField)
        .map((p) => p.id)
      const homeBefore = homeScore
      const awayBefore = awayScore

      setAwayScore((current) => current + 1)
      logTeamShot('away', {
        silent: true,
        timestamp: eventTimestamp,
        persist: false,
      })
      setPlayers((prev) => applyPlusMinusDelta(prev, -1))
      setToast(
        isPk
          ? `Opponent PK · ${opponentLabel} ${awayBefore + 1}`
          : `Opponent goal · ${opponentLabel} ${awayBefore + 1}`,
      )

      void runOptimisticSync(
        async () => {
          assertMatchActionOk(
            await apiLogGoal({
              matchId,
              ourGoal: false,
              isPk,
              timestamp: eventTimestamp,
              formation: activeFormation,
              homeScoreBefore: homeBefore,
              awayScoreBefore: awayBefore,
              teamName: matchTeamName.trim() || 'Home',
              opponent: matchOpponent,
              teamSlug: activeTeamSlug,
              onFieldPlayerIds,
              pairAutoShot: true,
            }),
          )
        },
        {
          label: 'commitOpponentGoal',
          onRevert: () => {
            setAwayScore(awayBefore)
            setAwayShots((n) => Math.max(0, n - 1))
            setPlayers((prev) => applyPlusMinusDelta(prev, 1))
          },
          onErrorToast: failToast('Could not save goal — try again'),
        },
      )
    },
    [
      matchId,
      seconds,
      halfLengthMinutes,
      activeFormation,
      matchOpponent,
      players,
      homeScore,
      awayScore,
      matchTeamName,
      activeTeamSlug,
      setAwayScore,
      setAwayShots,
      setPlayers,
      logTeamShot,
      setToast,
      runOptimisticSync,
    ],
  )

  const commitTeamCorner = useCallback(
    (side: 'home' | 'away') => {
      if (!matchId || !periodClockStarted) return
      const eventTimestamp = elapsedInHalf(seconds, halfLengthMinutes)
      if (side === 'home') {
        setHomeCorners((n) => n + 1)
      } else {
        setAwayCorners((n) => n + 1)
      }
      setToast(side === 'home' ? 'Corner · Home' : 'Corner · Away')
      void runOptimisticSync(
        async () => {
          assertMatchActionOk(
            await apiLogTeamEvent({
              matchId,
              side,
              eventKind: 'corner',
              timestamp: eventTimestamp,
              formation: activeFormation,
              pairAutoShot: false,
            }),
          )
        },
        {
          label: 'commitTeamCorner',
          quiet: true,
          onRevert: () => {
            if (side === 'home') setHomeCorners((n) => Math.max(0, n - 1))
            else setAwayCorners((n) => Math.max(0, n - 1))
          },
          onErrorToast: failToast('Could not save corner — try again'),
        },
      )
    },
    [
      matchId,
      periodClockStarted,
      seconds,
      halfLengthMinutes,
      activeFormation,
      setHomeCorners,
      setAwayCorners,
      setToast,
      runOptimisticSync,
    ],
  )

  const commitTeamSave = useCallback(
    (side: 'home' | 'away') => {
      if (!matchId || !periodClockStarted) return
      const eventTimestamp = elapsedInHalf(seconds, halfLengthMinutes)
      const gk = side === 'home' ? findActiveOnFieldGoalkeeper(players) : null

      if (side === 'away') {
        setAwaySaves((n) => n + 1)
        setToast('Save · Away')
      } else {
        setHomeSaves((n) => n + 1)
        if (gk) {
          const label = formatPlayerFullName(gk.firstName, gk.lastName)
          setToast(`Save · ${gk.number != null ? `#${gk.number} ` : ''}${label}`)
        } else {
          setToast('Save · Home (no GK on pitch)')
        }
      }

      logTeamShot(side === 'away' ? 'home' : 'away', {
        silent: true,
        timestamp: eventTimestamp,
        persist: false,
      })

      void runOptimisticSync(
        async () => {
          assertMatchActionOk(
            await apiLogTeamEvent({
              matchId,
              side,
              eventKind: 'save',
              timestamp: eventTimestamp,
              formation: activeFormation,
              playerId: gk?.id ?? null,
              pairAutoShot: true,
            }),
          )
        },
        {
          label: 'commitTeamSave',
          quiet: true,
          onRevert: () => {
            if (side === 'away') {
              setAwaySaves((n) => Math.max(0, n - 1))
              setHomeShots((n) => Math.max(0, n - 1))
            } else {
              setHomeSaves((n) => Math.max(0, n - 1))
              setAwayShots((n) => Math.max(0, n - 1))
            }
          },
          onErrorToast: failToast('Could not save — try again'),
        },
      )
    },
    [
      matchId,
      periodClockStarted,
      seconds,
      halfLengthMinutes,
      activeFormation,
      players,
      setHomeSaves,
      setAwaySaves,
      setHomeShots,
      setAwayShots,
      setToast,
      logTeamShot,
      runOptimisticSync,
    ],
  )

  const commitOurGoal = useCallback(
    (scorerId: string, assistPlayerId: string | null, isPk: boolean) => {
      if (!matchId) return

      const scorer = players.find((p) => p.id === scorerId)
      if (!scorer) return
      if (assistPlayerId === scorerId) return

      const eventTimestamp = elapsedInHalf(seconds, halfLengthMinutes)
      const assistPlayer =
        !isPk && assistPlayerId ? players.find((p) => p.id === assistPlayerId) : null
      const sidelineMap = buildSidelineNameMap(players.filter((p) => p.attending))
      const scorerLabel = formatPlayerLabel(scorer, sidelineMap)
      const assistLabel = assistPlayer ? formatPlayerLabel(assistPlayer, sidelineMap) : null
      const detail = isPk ? 'PK' : assistLabel ? assistLabel : 'Unassisted'
      const onFieldPlayerIds = players
        .filter((p) => p.attending && p.isOnField)
        .map((p) => p.id)
      const homeBefore = homeScore
      const awayBefore = awayScore

      setHomeScore((s) => s + 1)
      logTeamShot('home', {
        silent: true,
        timestamp: eventTimestamp,
        persist: false,
      })
      setPlayers((prev) => applyPlusMinusDelta(prev, 1))
      setToast(`Goal · ${scorerLabel} (${detail})`)
      closeGoalWizard()

      void runOptimisticSync(
        async () => {
          assertMatchActionOk(
            await apiLogGoal({
              matchId,
              ourGoal: true,
              isPk,
              scorerId,
              assistPlayerId: isPk ? null : assistPlayerId,
              scorerLabel,
              assistLabel,
              timestamp: eventTimestamp,
              formation: activeFormation,
              homeScoreBefore: homeBefore,
              awayScoreBefore: awayBefore,
              teamName: matchTeamName.trim() || 'Home',
              opponent: matchOpponent,
              teamSlug: activeTeamSlug,
              onFieldPlayerIds,
              pairAutoShot: true,
            }),
          )
        },
        {
          label: 'commitOurGoal',
          onRevert: () => {
            setHomeScore(homeBefore)
            setHomeShots((n) => Math.max(0, n - 1))
            setPlayers((prev) => applyPlusMinusDelta(prev, -1))
          },
          onErrorToast: failToast('Could not save goal — try again'),
        },
      )
    },
    [
      matchId,
      players,
      seconds,
      halfLengthMinutes,
      activeFormation,
      setHomeScore,
      setHomeShots,
      setPlayers,
      closeGoalWizard,
      matchTeamName,
      matchOpponent,
      homeScore,
      awayScore,
      activeTeamSlug,
      logTeamShot,
      setToast,
      runOptimisticSync,
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

  const handlePkGkPlayerChange = useCallback(
    (playerId: string | null) => {
      setPkGkPlayerId(playerId)
      if (matchId) {
        syncMatchRecord(matchId, { pk_gk_player_id: playerId })
      }
    },
    [matchId, setPkGkPlayerId],
  )

  const handleRecordPkAttempt = useCallback(
    async (input: {
      round: number
      team: 'us' | 'opponent'
      result: 'make' | 'miss'
      playerId: string | null
    }) => {
      if (!matchId) return
      const prevHome = homePkScore
      const prevAway = awayPkScore
      const nextHome =
        input.team === 'us' && input.result === 'make' ? homePkScore + 1 : homePkScore
      const nextAway =
        input.team === 'opponent' && input.result === 'make' ? awayPkScore + 1 : awayPkScore
      if (input.team === 'us' && input.result === 'make') setHomePkScore(nextHome)
      if (input.team === 'opponent' && input.result === 'make') setAwayPkScore(nextAway)

      const saved = await runOptimisticSync(
        async () => {
          assertMatchActionOk(
            await apiLogPkAttempt({
              matchId,
              round: input.round,
              team: input.team,
              result: input.result,
              playerId: input.playerId,
              formation: matchFormations.second,
              homePkScoreBefore: prevHome,
              awayPkScoreBefore: prevAway,
            }),
          )
        },
        {
          label: 'handleRecordPkAttempt',
          onRevert: () => {
            setHomePkScore(prevHome)
            setAwayPkScore(prevAway)
          },
          onErrorToast: failToast('Could not save PK attempt — try again'),
        },
      )
      if (saved === null) {
        throw new Error('Failed to log PK attempt')
      }
    },
    [
      matchId,
      homePkScore,
      awayPkScore,
      matchFormations.second,
      runOptimisticSync,
      setHomePkScore,
      setAwayPkScore,
      setToast,
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
        scheduledMatches={scheduledMatches}
        scheduledLoading={scheduledLoading}
        onScheduleNewGame={() => setAppMode('match_setup')}
        onStartLiveMatch={(id) => void handleStartLiveScheduledMatch(id)}
        startingLiveMatchId={startingLiveMatchId}
        onTeamManagement={() => setAppMode('team')}
        onReporting={() => {
          setReportingTab('matches')
          setAppMode('reporting')
        }}
        onViewRecaps={() => setAppMode('recap_history')}
        onResumeMatch={() => {
          void resumeLiveMatchScreen()
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
          isTestMatch={isTestMatch}
          onIsTestMatchChange={setIsTestMatch}
          goesToPks={goesToPks}
          onGoesToPksChange={setGoesToPks}
          totalPeriods={totalPeriods}
          onTotalPeriodsChange={(value) => {
            if (
              !supportsThreePeriodFormat({
                ageGroup: activeTeamAgeGroup,
                teamFormat: activeTeamFormat,
              })
            ) {
              return
            }
            setTotalPeriods(value)
            const options = periodLengthOptions(value)
            if (!(options as readonly number[]).includes(halfLengthMinutes)) {
              setHalfLengthMinutes(defaultPeriodLengthMinutes(value))
            }
          }}
          allowThreePeriods={supportsThreePeriodFormat({
            ageGroup: activeTeamAgeGroup,
            teamFormat: activeTeamFormat,
          })}
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
          onScheduleMatch={() => void handleScheduleMatch()}
          onStartLiveNow={() => void handleStartMatch()}
          canStartMatch={canStartMatch && !startingMatch && !schedulingMatch}
          startMatchBlockReason={
            schedulingMatch
              ? 'Saving scheduled match…'
              : startingMatch
                ? 'Getting ready…'
                : startMatchBlockReason
          }
          schedulingMatch={schedulingMatch}
          startingMatch={startingMatch}
          attendingCount={attendingCount}
          lineupPresets={lineupPresets}
          onLoadLineupPreset={handleLoadLineupPreset}
          onBackToHome={() => setAppMode('home')}
          onShareParentHub={ENABLE_PARENT_HUB ? () => void handleShareParentHub() : undefined}
          parentHubUrl={
            ENABLE_PARENT_HUB && activeTeamSlug ? buildParentHubUrl(activeTeamSlug) : null
          }
          setupSlotAssignments={setupSlotAssignments}
          setupSlotLabelOverrides={setupSlotLabelOverrides}
          onSetupSlotAssignmentsChange={setSetupSlotAssignments}
          onSetupSlotLabelOverridesChange={setSetupSlotLabelOverrides}
          setupPitchKey={setupPitchKey}
          setupAssignmentsRef={setupAssignmentsRef}
          setupLabelOverridesRef={setupLabelOverridesRef}
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
          endedPeriod={currentPeriod}
          nextPeriod={Math.min(totalPeriods, currentPeriod + 1)}
          totalPeriods={totalPeriods}
          players={players}
          secondHalfFormation={matchFormations.second}
          onSetSecondHalfFormation={setSecondHalfFormation}
          secondHalfStarters={halftimeSecondHalf}
          initialSlotAssignments={halftimeSlotAssignments}
          initialSlotLabelOverrides={halftimeSlotLabelOverrides}
          assignmentsResetKey={`halftime-${matchId ?? 'local'}-${halftimePitchKey}`}
          halftimeAssignmentsRef={halftimeAssignmentsRef}
          halftimeLabelOverridesRef={halftimeLabelOverridesRef}
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
        onRecordAttempt={handleRecordPkAttempt}
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
          isCompletedMatch={matchStatus === 'final'}
          openInEditMode={
            matchStatus === 'final' &&
            (recapReturnMode === 'recap_history' || recapReturnMode === 'reporting')
          }
          onFinalize={() => void handleFinalizeRecap()}
          onDeleteMatch={handleDeleteMatch}
          canDeleteMatches={canDeleteMatches}
          onRemoveGoal={removeLastGoal}
          onHome={handleExitRecap}
          onToast={setToast}
        />
      </>
    )
  }

  return (
    <ErrorBoundary sectionLabel="Live Match" resetKey={matchId} className="min-h-0 flex-1">
    <main className={APP_SHELL_LOCKED}>
      <MatchHeader
        pinned
        teamName={matchTeamName}
        coachName={matchCoachName}
        opponent={matchOpponent}
        homeScore={homeScore}
        awayScore={awayScore}
        homeShots={homeShots}
        awayShots={awayShots}
        homeSaves={homeSaves}
        awaySaves={awaySaves}
        homeCorners={homeCorners}
        awayCorners={awayCorners}
        seconds={seconds}
        period={period}
        currentPeriod={currentPeriod}
        totalPeriods={totalPeriods}
        halfLengthMinutes={halfLengthMinutes}
        running={running}
        periodClockStarted={periodClockStarted}
        isTest={matchIsTest}
        syncPending={syncPending}
        wakeLockActive={wakeLockActive}
        onHome={() => setAppMode('home')}
        onLogGoal={() => openGoalWizard('us')}
        onOpponentGoal={() => openGoalWizard('opponent')}
        onRemoveGoal={(side) => void removeLastGoal(side)}
        onLogShot={commitTeamShot}
        onLogSave={commitTeamSave}
        onLogCorner={commitTeamCorner}
        onLogCard={() => setCardWizardOpen(true)}
        onShareStatTracker={
          ENABLE_STAT_TRACKER && matchId
            ? () => void handleShareStatTracker()
            : undefined
        }
      />

      <div className={`${APP_CONTAINER} min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-y-contain pt-4 pb-40 md:space-y-6 md:pt-5 md:pb-44`}>
        {ENABLE_QA_SPEED ? (
          <QaSpeedControls speed={qaSpeedMultiplier} onSpeedChange={setQaSpeedMultiplier} />
        ) : null}

        {ENABLE_STAT_TRACKER && matchId ? (
          <SidelineStatsPanel matchId={matchId} players={players} />
        ) : null}

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
          halfLengthMinutes={halfLengthMinutes}
          maxFieldPlayers={maxFieldPlayers}
          teamFormat={activeTeamFormat}
          initialSlotAssignments={currentPeriod > 1 ? secondHalfSlotAssignments : undefined}
          onSwap={handleLiveSwap}
          onSubIn={handleLiveSubIn}
          onSubOut={handleLiveSubOut}
          onReassignPosition={handleLiveReassignPosition}
        />
      </div>

      <StickyMatchActionBar>
        {!periodClockStarted && currentPeriod === 1 ? (
          <PeriodStartButton
            label={startPeriodButtonLabel(1, totalPeriods)}
            onStart={handleStartFirstHalf}
          />
        ) : periodClockStarted ? (
          <EndPeriodButton
            currentPeriod={currentPeriod}
            totalPeriods={totalPeriods}
            onEndPeriod={() => void handleEnterHalftime()}
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

      {goalWizardOpen ? (
        <ModalSuspense>
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
        </ModalSuspense>
      ) : null}

      {cardWizardOpen ? (
        <ModalSuspense>
          <CardWizardModal
            open={cardWizardOpen}
            players={players}
            onConfirm={handleConfirmCard}
            onClose={() => setCardWizardOpen(false)}
          />
        </ModalSuspense>
      ) : null}

      {liveDeleteConfirmOpen && canDeleteMatches ? (
        <ModalSuspense>
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
        </ModalSuspense>
      ) : null}

      {endTimingOpen ? (
        <ModalSuspense>
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
        </ModalSuspense>
      ) : null}
    </main>
    </ErrorBoundary>
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
      <AppNavShell>
        <ScreenSuspense>{renderScreen()}</ScreenSuspense>
      </AppNavShell>
      {toastOverlay}
    </>
  )
}
