import { lazy, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { CheckCircle2 } from 'lucide-react'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { HomeScreen } from '@/components/HomeScreen'
import { SidelineStatsPanel } from '@/components/SidelineStatsPanel'
import { SubCountdownTimer } from '@/components/SubCountdownTimer'
import {
  buildAppNavItems,
  resolveActiveNavSection,
  type AppNavSection,
} from '@/components/AppNavDrawer'
import { GlobalTeamSelector } from '@/components/GlobalTeamSelector'
import { ModalSuspense } from '@/components/Spinner'
import { MatchHeader } from '@/components/MatchHeader'
import { QaSpeedControls } from '@/components/QaSpeedControls'
import { PlayerEditModal, type PlayerEditDraft } from '@/components/PlayerEditModal'
import {
  PeriodStartButton,
  StickyMatchActionBar,
  EndPeriodButton,
} from '@/components/match/MatchActionControls'
import {
  LiveTacticalPitch,
  type LiveTacticalPitchHandle,
  type PositionReassignUpdate,
} from '@/components/LiveTacticalPitch'
import { CoachAppLayout } from '@/layouts/CoachAppLayout'
import { MatchSetupPage } from '@/pages/MatchSetupPage'
import { HalftimePage } from '@/pages/HalftimePage'
import { teamsForSelector } from '@/lib/team-context'
import { formatTeamDisplayName } from '@/lib/age-groups'
import { resolveTeamAgeGroup } from '@/lib/season-roster'
import type { ReportingTab } from '@/components/reporting/ReportingTabBar'
import type { GoalWizardStep, GoalWizardTeam } from '@/components/GoalWizardModal'
import { useGameDayApp } from '@/hooks/useGameDayApp'
import { useWakeLock, WAKE_LOCK_BLOCKED_TOAST } from '@/hooks/useWakeLock'
import { useAuth } from '@/contexts/AuthContext'
import { formatAppRoleLabel } from '@/lib/staff-roles'
import type { FormationRemapResult } from '@/lib/formations'
import {
  getFormationLabel,
  matchPositionsFromSlotAssignments,
  resolveFormationIdForFormat,
} from '@/lib/formations'
import {
  getAttendingIds,
  getFirstHalfStarterIds,
  getMaxFieldPlayers,
  getSetupLineupBlockReason,
  hasSlotAssignments,
  isHalftimeLineupValid,
} from '@/lib/lineup'
import { resolveSetupLineup } from '@/lib/lineup-presets'
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
  applyKickoffSlotLineup,
  applySubIn,
  applySubOut,
  applySubstitution,
  freezeFirstHalfStarters,
  stampAllOnField,
} from '@/lib/play-time'
import {
  elapsedInHalf,
  formatClock,
  halfDurationSeconds,
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
import { shouldEnterPenaltyShootout } from '@/lib/penalty-kicks'
import { findActiveOnFieldGoalkeeper } from '@/lib/match-shot-save'
import { removeLastGoalForMatch } from '@/lib/remove-goal'
import type { DbMatch } from '@/types/database'
import {
  buildSidelineNameMap,
  formatPlayerFullName,
  formatPlayerLabel,
} from '@/lib/player-names'
import type { MatchPlayer } from '@/types/match'
import {
  defaultPeriodLengthMinutes,
  formatPeriodLong,
  periodLengthOptions,
  resolveMatchFormatDefaults,
  startPeriodButtonLabel,
  supportsThreePeriodFormat,
} from '@/lib/match-periods'
import { APP_CONTAINER, APP_SHELL_LOCKED } from '@/lib/layout'
import { nextJerseyNumber } from '@/lib/next-jersey-number'

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

export function CoachDashboard() {
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
    setFirstHalfStarterIds,
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
  const activeFormation = resolveFormationIdForFormat(
    period === '1st' ? matchFormations.first : matchFormations.second,
    activeTeamFormat,
  )

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
              resolveFormationIdForFormat(matchFormations.first, activeTeamFormat),
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
      firstHalfFormation: resolveFormationIdForFormat(
        matchFormations.first,
        activeTeamFormat,
      ),
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
    const assignments = livePitchRef.current?.getSlotAssignments()
    const labelOverrides = livePitchRef.current?.getSlotLabelOverrides()
    const kickoffPlayers =
      assignments && hasSlotAssignments(assignments)
        ? applyKickoffSlotLineup(
            players,
            assignments,
            activeFormation,
            labelOverrides,
            activeTeamFormat,
          )
        : players
    const stamped = freezeFirstHalfStarters(stampAllOnField(kickoffPlayers, seconds))
    setPlayers(stamped)
    setFirstHalfStarterIds(
      stamped.filter((player) => player.isFirstHalfStarter).map((player) => player.id),
    )
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
              insertStarterEvents: true,
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
    setFirstHalfStarterIds,
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
    activeTeamFormat,
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

      if (!periodClockStarted) return

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
      periodClockStarted,
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

      if (!periodClockStarted) return

      const positionUpdates = updates.map((update) => {
        const previous =
          update.previousPosition ??
          previousPlayers.find((player) => player.id === update.playerId)?.matchPosition
        return {
          playerId: update.playerId,
          position: update.position,
          ...(previous ? { previousPosition: previous } : {}),
        }
      })

      void runOptimisticSync(
        async () => {
          assertMatchActionOk(
            await apiLogFormation({
              matchId,
              kind: 'reassign',
              timestamp: eventTimestamp,
              formation: activeFormation,
              positionUpdates,
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
    [
      matchId,
      seconds,
      halfLengthMinutes,
      activeFormation,
      players,
      periodClockStarted,
      setPlayers,
      runOptimisticSync,
    ],
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

      if (!periodClockStarted) return

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
          quiet: true,
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
      periodClockStarted,
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

      if (!periodClockStarted) return

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
          quiet: true,
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
      periodClockStarted,
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

      if (!periodClockStarted) return

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
          quiet: true,
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
      periodClockStarted,
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
          quiet: true,
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
          quiet: true,
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
        <MatchSetupPage
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
          firstHalfFormation={resolveFormationIdForFormat(
            matchFormations.first,
            activeTeamFormat,
          )}
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
        <HalftimePage
          teamName={matchTeamName}
          opponent={matchOpponent}
          seconds={seconds}
          halfLengthMinutes={halfLengthMinutes}
          endedPeriod={currentPeriod}
          nextPeriod={Math.min(totalPeriods, currentPeriod + 1)}
          totalPeriods={totalPeriods}
          players={players}
          secondHalfFormation={resolveFormationIdForFormat(
            matchFormations.second,
            activeTeamFormat,
          )}
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
    <CoachAppLayout
      navOpen={navOpen}
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
      toast={toastOverlay}
    >
      {renderScreen()}
    </CoachAppLayout>
  )
}
