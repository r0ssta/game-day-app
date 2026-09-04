import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  createDefaultSetupLineup,
  ensureHalftimeStarters,
  ensureSetupLineup,
  hasSlotAssignments,
} from '@/lib/lineup'
import { ensureMatchPositions, normalizeRecapPosition } from '@/lib/positions'
import {
  applySecondHalfLineup,
  applySlotAssignmentPositions,
  finalizeAllOnField,
  stampAllOnField,
  stampOnFieldAtClock,
} from '@/lib/play-time'
import {
  defaultMatchDate,
  defaultMatchTime,
  getMatchSortTimestamp,
  matchDateTimeIso,
  normalizeMatchTimeForInput,
} from '@/lib/match-schedule'
import type { LocationType } from '@/lib/match-location'
import { resolveMatchLocationType } from '@/lib/match-location'
import {
  initialHalfClock,
  restoreMatchClockSeconds,
} from '@/lib/match-clock'
import { parseQualitativeContext } from '@/lib/qualitative-context'
import type { SubFrequency } from '@/lib/sub-rotation'
import {
  DEFAULT_FORMATION_ID,
  getDefaultFormationId,
  isFormationValidForFormat,
  resolveFormationIdForFormat,
  slotAssignmentsFromMatchPositions,
} from '@/lib/formations'
import { applyPresetToSetup, applyPresetToHalftime, buildFormationJson, validatePresetFormation } from '@/lib/lineup-presets'
import {
  normalizeTeamFormat,
  type TeamFormat,
} from '@/lib/team-format'
import {
  type AgeGroup,
  defaultTeamNameForAgeGroup,
  formatForAgeGroup,
  formatTeamDisplayName,
  normalizeAgeGroup,
  stripAgeGroupFromTeamName,
} from '@/lib/age-groups'
import {
  completeMatch,
  createMatchRecord,
  createMatchStats,
  replaceMatchStats,
  createScheduledMatchRecord,
  deleteMatchRecord,
  deleteLineupPreset,
  dbPlayerToRoster,
  fetchActiveMatch,
  fetchMatchBundleById,
  promoteScheduledMatchToLive,
  saveQualitativeContext,
  fetchActiveSeason,
  fetchAgeGroupPoolPlayers,
  fetchPlayersByIds,
  fetchCoaches,
  fetchTeamCoachingStaff,
  fetchClubStaffCoachNames,
  type TeamCoachingStaff,
  fetchLineupPresetsByTeamId,
  fetchMatchRecapBundle,
  fetchScheduledMatchesByTeamId,
  fetchSeasonRosterPlayers,
  fetchSeasons,
  fetchTeams,
  insertLineupPreset,
  insertTeam,
  rebuildMatchPlayers,
  fetchMatchEvents,
  backfillMissingGoalShots,
  resolveCoachIdForName,
  resolveMatchCoachName,
  syncMatchClock,
  syncMatchRecord,
  syncMatchStats,
  updateMatchRecord,
  updateLineupPreset,
  updateTeamFormat as updateTeamFormatApi,
  updateTeamAgeGroup as updateTeamAgeGroupApi,
  updateTeamPrimaryCoachName as updateTeamPrimaryCoachNameApi,
  updateTeamProfile as updateTeamProfileApi,
  setTeamActiveStatus,
  upsertPlayer,
  setPlayerActiveStatus,
  createSeason,
  updateSeason,
  setActiveSeason,
  archiveSeason,
  assignPlayerToSeasonRoster,
  removePlayerFromSeasonRoster,
} from '@/lib/supabase-api'
import type { DbCoach, DbLineupPreset, DbMatch, DbSeason, DbTeam } from '@/types/database'
import type {
  AppMode,
  MatchPeriod,
  MatchPlayer,
  MatchFormations,
  MatchPositionsConfig,
  RosterPlayer,
  SetupLineup,
  TotalPeriods,
} from '@/types/match'
import {
  persistActiveTeamId,
  readPersistedActiveTeamId,
  resolveTeamScope,
  type TeamScope,
} from '@/lib/team-context'
import { isSessionMatchForSelectedTeam } from '@/lib/match-status'
import {
  poolPlayerToGuestRoster,
  resolveTeamAgeGroup,
  seasonRosterToPlayers,
} from '@/lib/season-roster'
import { applyCardsFromEvents } from '@/lib/match-cards'
import { aggregateTeamShotSaveTotals } from '@/lib/match-shot-save'
import {
  fetchLiveMatchSnapshot,
  isActiveStaffMatchScreen,
  isStaleKickoffSnapshot,
  shouldAdoptRemoteClock,
  shouldHoldLocalLiveClock,
  snapshotHydrateResult,
  type LiveMatchHydrateResult,
} from '@/lib/live-match-snapshot'
import { apiEndRegulation, apiFinalizePk } from '@/lib/match-api'
import {
  defaultPeriodLengthMinutes,
  periodIndexToCode,
  resolveCurrentPeriod,
  resolvePeriodLengthMinutes,
  resolveTotalPeriods,
  supportsThreePeriodFormat,
} from '@/lib/match-periods'

const DEFAULT_TOTAL_PERIODS: TotalPeriods = 2
const DEFAULT_HALF_LENGTH = defaultPeriodLengthMinutes(DEFAULT_TOTAL_PERIODS)

export function useGameDayApp() {
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [rosterLoading, setRosterLoading] = useState(false)

  const [teams, setTeams] = useState<DbTeam[]>([])
  const [coaches, setCoaches] = useState<DbCoach[]>([])
  const [seasons, setSeasons] = useState<DbSeason[]>([])
  const [activeSeason, setActiveSeasonState] = useState<DbSeason | null>(null)
  const [masterRoster, setMasterRoster] = useState<RosterPlayer[]>([])

  const [appMode, setAppMode] = useState<AppMode>('home')
  const [matchId, setMatchId] = useState<string | null>(null)
  const [matchStatus, setMatchStatus] = useState<DbMatch['status'] | null>(null)
  const [players, setPlayers] = useState<MatchPlayer[]>([])
  const [homeScore, setHomeScore] = useState(0)
  const [awayScore, setAwayScore] = useState(0)
  const [homeShots, setHomeShots] = useState(0)
  const [awayShots, setAwayShots] = useState(0)
  const [homeSaves, setHomeSaves] = useState(0)
  const [awaySaves, setAwaySaves] = useState(0)
  const [homeCorners, setHomeCorners] = useState(0)
  const [awayCorners, setAwayCorners] = useState(0)
  const [seconds, setSeconds] = useState(0)
  const [period, setPeriod] = useState<MatchPeriod>('1st')
  const [currentPeriod, setCurrentPeriod] = useState(1)
  const [totalPeriods, setTotalPeriods] = useState<TotalPeriods>(DEFAULT_TOTAL_PERIODS)
  const [running, setRunningState] = useState(false)
  const runningRef = useRef(false)
  const setRunning = useCallback((next: boolean | ((prev: boolean) => boolean)) => {
    setRunningState((prev) => {
      const value = typeof next === 'function' ? next(prev) : next
      runningRef.current = value
      return value
    })
  }, [])
  const [periodClockStarted, setPeriodClockStarted] = useState(false)
  const [firstHalfStarterIds, setFirstHalfStarterIds] = useState<string[]>([])
  const [secondHalfStarterIds, setSecondHalfStarterIds] = useState<string[]>([])
  const [halftimeSecondHalf, setHalftimeSecondHalf] = useState<Record<string, boolean>>({})
  const [halftimeSlotAssignments, setHalftimeSlotAssignments] = useState<
    Record<string, string | null>
  >({})
  const [halftimeSlotLabelOverrides, setHalftimeSlotLabelOverrides] = useState<
    Record<string, string>
  >({})
  const [secondHalfSlotAssignments, setSecondHalfSlotAssignments] = useState<
    Record<string, string | null>
  >({})
  const [lineupPresets, setLineupPresets] = useState<DbLineupPreset[]>([])
  const [scheduledMatches, setScheduledMatches] = useState<DbMatch[]>([])
  const [scheduledLoading, setScheduledLoading] = useState(false)
  const [editingScheduledMatchId, setEditingScheduledMatchId] = useState<string | null>(null)
  const [openingScheduledEditId, setOpeningScheduledEditId] = useState<string | null>(null)
  const [teamRoster, setTeamRoster] = useState<RosterPlayer[]>([])
  const [setupSlotAssignments, setSetupSlotAssignments] = useState<
    Record<string, string | null> | undefined
  >(undefined)
  const [setupSlotLabelOverrides, setSetupSlotLabelOverrides] = useState<
    Record<string, string> | undefined
  >(undefined)
  const [setupPitchKey, setSetupPitchKey] = useState(0)
  const [halftimePitchKey, setHalftimePitchKey] = useState(0)

  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null)
  const [sessionMatchTeamId, setSessionMatchTeamId] = useState<string | null>(null)
  const sessionMatchSyncGenRef = useRef(0)
  const [setupCoachName, setSetupCoachName] = useState('')
  const [teamCoachingStaff, setTeamCoachingStaff] = useState<TeamCoachingStaff>({
    headCoaches: [],
    assistants: [],
  })
  const [clubStaffCoachNames, setClubStaffCoachNames] = useState<string[]>([])
  const [matchTeamName, setMatchTeamName] = useState('')
  const [matchCoachName, setMatchCoachName] = useState('')
  const [matchOpponent, setMatchOpponent] = useState('')
  const [matchLocationType, setMatchLocationType] = useState<LocationType>('home')
  const [matchTournamentGame, setMatchTournamentGame] = useState(false)
  const [matchIsTest, setMatchIsTest] = useState(false)
  const [matchGoesToPks, setMatchGoesToPks] = useState(false)
  const [homePkScore, setHomePkScore] = useState(0)
  const [awayPkScore, setAwayPkScore] = useState(0)
  const [pkWinnerIsUs, setPkWinnerIsUs] = useState<boolean | null>(null)
  const [pkGkPlayerId, setPkGkPlayerId] = useState<string | null>(null)
  const [halfLengthMinutes, setHalfLengthMinutes] = useState(DEFAULT_HALF_LENGTH)
  const [gkPlaysFullHalf, setGkPlaysFullHalf] = useState(true)
  const [subFrequency, setSubFrequency] = useState<SubFrequency>('medium')
  /** Pre-game effective interval (minutes) from Sub Rotation Assistant, including ± override. */
  const [setupSubIntervalMinutes, setSetupSubIntervalMinutes] = useState<number | null>(null)
  const [subIntervalSeconds, setSubIntervalSeconds] = useState<number | null>(null)

  const [opponent, setOpponent] = useState('')
  const [locationType, setLocationType] = useState<LocationType>('home')
  const [tournamentGame, setTournamentGame] = useState(false)
  const [isTestMatch, setIsTestMatch] = useState(false)
  const [goesToPks, setGoesToPks] = useState(false)
  const [matchDate, setMatchDate] = useState(defaultMatchDate)
  const [matchTime, setMatchTime] = useState(defaultMatchTime)
  const [setupLineup, setSetupLineup] = useState<SetupLineup>({ attending: {}, startFirstHalf: {} })
  const [matchPositions, setMatchPositions] = useState<MatchPositionsConfig>({})
  const [matchFormations, setMatchFormations] = useState<MatchFormations>({
    first: DEFAULT_FORMATION_ID,
    second: DEFAULT_FORMATION_ID,
  })

  const periodRef = useRef(period)
  const matchFormationsRef = useRef(matchFormations)
  const matchIdRef = useRef(matchId)
  const lastClockWriteAtRef = useRef(0)
  const hydrateInFlightRef = useRef(false)
  const localWriteGenRef = useRef(0)
  const localClockOwnedRef = useRef(false)
  const localIntermissionRef = useRef(false)
  const liveStateRef = useRef({
    appMode,
    players,
    masterRoster,
    seconds,
    periodClockStarted,
    running,
  })
  const setupCoachPrefillRef = useRef<{ appMode: AppMode; teamId: string | null }>({
    appMode: 'home',
    teamId: null,
  })
  const pendingScheduledSetupRef = useRef<{
    extraPlayers: RosterPlayer[]
    lineup: SetupLineup
    positions: MatchPositionsConfig
    formationId: string
    slotAssignments: Record<string, string | null>
  } | null>(null)

  useEffect(() => {
    periodRef.current = period
  }, [period])

  useEffect(() => {
    matchFormationsRef.current = matchFormations
  }, [matchFormations])

  useEffect(() => {
    matchIdRef.current = matchId
  }, [matchId])

  liveStateRef.current = {
    appMode,
    players,
    masterRoster,
    seconds,
    periodClockStarted: localClockOwnedRef.current || periodClockStarted,
    running: localClockOwnedRef.current || running,
  }

  const getActiveFormation = useCallback(() => {
    return periodRef.current === '1st'
      ? matchFormationsRef.current.first
      : matchFormationsRef.current.second
  }, [])

  const setFirstHalfFormation = useCallback((formationId: string) => {
    setMatchFormations((prev) => ({ ...prev, first: formationId }))
  }, [])

  const setSecondHalfFormation = useCallback((formationId: string) => {
    setMatchFormations((prev) => ({ ...prev, second: formationId }))
  }, [])

  const setActiveFormation = useCallback((formationId: string) => {
    setMatchFormations((prev) =>
      periodRef.current === '1st'
        ? { ...prev, first: formationId }
        : { ...prev, second: formationId },
    )
  }, [])

  const applyMatchPeriodState = useCallback(
    (match: Pick<DbMatch, 'period' | 'current_period' | 'total_periods' | 'period_length' | 'half_length'>) => {
      const nextTotal = resolveTotalPeriods(match)
      const nextCurrent = resolveCurrentPeriod(match)
      const nextLength = resolvePeriodLengthMinutes(match, DEFAULT_HALF_LENGTH)
      setTotalPeriods(nextTotal)
      setCurrentPeriod(nextCurrent)
      setPeriod(periodIndexToCode(nextCurrent))
      setHalfLengthMinutes(nextLength)
    },
    [],
  )

  const persistMatchClock = useCallback((targetMatchId: string, remainingSeconds: number) => {
    lastClockWriteAtRef.current = Date.now()
    syncMatchClock(targetMatchId, remainingSeconds)
  }, [])

  const noteLocalMatchMutation = useCallback(() => {
    localWriteGenRef.current += 1
  }, [])

  const claimLocalClock = useCallback(() => {
    localClockOwnedRef.current = true
    runningRef.current = true
    liveStateRef.current = {
      ...liveStateRef.current,
      running: true,
      periodClockStarted: true,
    }
    setRunning(true)
  }, [setRunning])

  const releaseLocalClock = useCallback(() => {
    localClockOwnedRef.current = false
    runningRef.current = false
    liveStateRef.current = {
      ...liveStateRef.current,
      running: false,
    }
    setRunning(false)
  }, [setRunning])

  const isLocalClockOwned = useCallback(() => localClockOwnedRef.current, [])

  const shouldSkipLiveHydrate = useCallback(
    () =>
      localIntermissionRef.current ||
      shouldHoldLocalLiveClock({
        clockOwned: localClockOwnedRef.current,
        appMode: liveStateRef.current.appMode,
        periodClockStarted: liveStateRef.current.periodClockStarted,
        running: runningRef.current,
      }),
    [],
  )

  const hydrateLiveMatch = useCallback(
    async (options?: {
      applyMode?: boolean
      force?: boolean
    }): Promise<LiveMatchHydrateResult | null> => {
      const targetMatchId = matchIdRef.current
      if (!targetMatchId) return null
      if (!options?.force && shouldSkipLiveHydrate()) return null
      if (!options?.force && hydrateInFlightRef.current) return null
      hydrateInFlightRef.current = true
      const writeGen = localWriteGenRef.current
      try {
        const rosterForFetch = liveStateRef.current.masterRoster
        const snapshot = await fetchLiveMatchSnapshot(targetMatchId, rosterForFetch)
        if (!snapshot || matchIdRef.current !== targetMatchId) return null
        if (writeGen !== localWriteGenRef.current) return null

        // Kickoff / tick may have started while this snapshot was in flight.
        if (shouldSkipLiveHydrate() || liveStateRef.current.appMode === 'halftime') {
          const latest = liveStateRef.current
          const localMode = isActiveStaffMatchScreen(latest.appMode)
            ? latest.appMode
            : 'match'
          return {
            ...snapshotHydrateResult(snapshot, latest.seconds),
            mode: localMode,
            periodClockStarted: latest.periodClockStarted,
            seconds: latest.seconds,
          }
        }

        const latest = liveStateRef.current
        const localRunning = runningRef.current

        const {
          match,
          roster,
          players: remotePlayers,
          shotSaveTotals,
          clockSeconds,
          formationId,
          endedOnFieldIds,
        } = snapshot
        const result = snapshotHydrateResult(snapshot, clockSeconds)

        if (roster !== latest.masterRoster) {
          setMasterRoster(roster)
        }

        setMatchStatus(match.status)
        setHomeScore(match.home_score)
        setAwayScore(match.away_score)
        setHomeShots(shotSaveTotals.homeShots)
        setAwayShots(shotSaveTotals.awayShots)
        setHomeSaves(shotSaveTotals.homeSaves)
        setAwaySaves(shotSaveTotals.awaySaves)
        setHomeCorners(shotSaveTotals.homeCorners)
        setAwayCorners(shotSaveTotals.awayCorners)
        setHomePkScore(match.home_pk_score ?? 0)
        setAwayPkScore(match.away_pk_score ?? 0)
        setPkWinnerIsUs(match.pk_winner_is_us ?? null)
        setPkGkPlayerId(match.pk_gk_player_id ?? null)
        setMatchGoesToPks(Boolean(match.goes_to_pks))
        setSubIntervalSeconds(match.sub_interval_seconds ?? null)
        setGkPlaysFullHalf(match.gk_plays_full_half !== false)

        const staleKickoff = isStaleKickoffSnapshot({
          localClockStarted: latest.periodClockStarted,
          localOnFieldCount: latest.players.filter(
            (player) => player.attending && player.isOnField,
          ).length,
          remoteOnFieldCount: remotePlayers.filter(
            (player) => player.attending && player.isOnField,
          ).length,
        })
        if (staleKickoff) {
          const localMode =
            latest.appMode === 'match' ||
            latest.appMode === 'halftime' ||
            latest.appMode === 'penalty_shootout'
              ? latest.appMode
              : result.mode
          return {
            ...result,
            mode: localMode,
            periodClockStarted: latest.periodClockStarted,
            seconds: latest.seconds,
          }
        }

        const remoteWouldStopLocalClock =
          latest.periodClockStarted &&
          latest.appMode === 'match' &&
          !match.period_clock_started

        if (!localRunning && !remoteWouldStopLocalClock && !latest.periodClockStarted) {
          applyMatchPeriodState(match)
          setPeriodClockStarted(match.period_clock_started)
        }
        setFirstHalfStarterIds(
          snapshot.players
            .filter((player) => player.isFirstHalfStarter)
            .map((player) => player.id),
        )
        setSecondHalfStarterIds(
          snapshot.players
            .filter((player) => player.isSecondHalfStarter)
            .map((player) => player.id),
        )

        const adoptClock =
          !localRunning &&
          !latest.periodClockStarted &&
          shouldAdoptRemoteClock({
            localSeconds: latest.seconds,
            remoteSeconds: clockSeconds,
            localClockWrittenAtMs: lastClockWriteAtRef.current,
            nowMs: Date.now(),
            remoteClockStarted: match.period_clock_started,
            localClockStarted: latest.periodClockStarted,
            localRunning,
          })
        const displaySeconds = localRunning || latest.periodClockStarted
          ? latest.seconds
          : adoptClock
            ? clockSeconds
            : latest.seconds
        if (adoptClock) {
          setSeconds(clockSeconds)
        }

        if (!localRunning && !latest.periodClockStarted) {
          let nextPlayers = remotePlayers
          if (result.mode === 'match' && match.period_clock_started) {
            nextPlayers = stampOnFieldAtClock(remotePlayers, displaySeconds)
          }
          setPlayers(nextPlayers)
        }

        if (formationId) {
          const nextCurrent = result.currentPeriod
          const teamFormat = normalizeTeamFormat(
            teams.find((team) => team.id === match.team_id)?.format,
          )
          const resolvedFormation = resolveFormationIdForFormat(formationId, teamFormat)
          setMatchFormations((prev) =>
            nextCurrent <= 1
              ? { ...prev, first: resolvedFormation }
              : { ...prev, second: resolvedFormation },
          )
        }

        if (result.mode === 'halftime' && !localRunning) {
          setHalftimeSecondHalf((prev) => {
            if (Object.keys(prev).length > 0) return prev
            const seed =
              endedOnFieldIds.length > 0
                ? endedOnFieldIds
                : latest.players.filter((player) => player.isOnField).map((player) => player.id)
            if (seed.length === 0) return prev
            const attending = new Set(
              remotePlayers.filter((player) => player.attending).map((player) => player.id),
            )
            return Object.fromEntries(
              seed.filter((id) => attending.has(id)).map((id) => [id, true]),
            )
          })
        }

        const followRemoteMode =
          Boolean(options?.applyMode) || isActiveStaffMatchScreen(latest.appMode)
        if (localRunning || latest.periodClockStarted) {
          if (result.mode === 'match' && match.period_clock_started) {
            claimLocalClock()
          }
        } else if (followRemoteMode) {
          setAppMode(result.mode)
          if (result.mode === 'match' && match.period_clock_started) {
            claimLocalClock()
          } else {
            setRunning(false)
          }
        } else if (!latest.periodClockStarted) {
          setRunning(false)
        }

        return { ...result, seconds: displaySeconds }
      } catch (err) {
        console.warn('[live-sync] hydrate failed', err)
        return null
      } finally {
        hydrateInFlightRef.current = false
      }
    },
    [applyMatchPeriodState, claimLocalClock, shouldSkipLiveHydrate, teams],
  )

  const resumeLiveMatchScreen = useCallback(async () => {
    const latest = liveStateRef.current
    if (localIntermissionRef.current || latest.appMode === 'halftime') {
      setAppMode('halftime')
      return
    }
    if (latest.periodClockStarted || localClockOwnedRef.current) {
      claimLocalClock()
      setAppMode(isActiveStaffMatchScreen(latest.appMode) ? latest.appMode : 'match')
      return
    }
    const result = await hydrateLiveMatch({ applyMode: true, force: true })
    if (result?.mode === 'match' && result.periodClockStarted) {
      claimLocalClock()
      return
    }
    const after = liveStateRef.current
    if (after.periodClockStarted) claimLocalClock()
    setAppMode(isActiveStaffMatchScreen(after.appMode) ? after.appMode : 'match')
  }, [hydrateLiveMatch, claimLocalClock])

  const applyRoster = useCallback((roster: RosterPlayer[]) => {
    const pending = pendingScheduledSetupRef.current
    const extra = pending?.extraPlayers ?? []
    const extraIds = new Set(roster.map((player) => player.id))
    const nextRoster =
      extra.length > 0
        ? [...roster, ...extra.filter((player) => !extraIds.has(player.id))]
        : roster
    setMasterRoster(nextRoster)
    if (pending) {
      pendingScheduledSetupRef.current = null
      const ids = nextRoster.map((player) => player.id)
      setSetupLineup(ensureSetupLineup(ids, pending.lineup))
      setMatchPositions(ensureMatchPositions(nextRoster, pending.positions))
      setMatchFormations((prev) => ({
        ...prev,
        first: pending.formationId,
        second: pending.formationId,
      }))
      setSetupSlotAssignments(pending.slotAssignments)
      setSetupPitchKey((key) => key + 1)
      return
    }
    setSetupLineup(createDefaultSetupLineup(nextRoster.map((p) => p.id)))
    setMatchPositions(ensureMatchPositions(nextRoster))
  }, [])

  const loadTeamRoster = useCallback(
    async (teamId: string, seasonId?: string | null) => {
      setRosterLoading(true)
      try {
        const resolvedSeasonId = seasonId ?? activeSeason?.id
        if (!resolvedSeasonId) {
          applyRoster([])
          return
        }
        const entries = await fetchSeasonRosterPlayers(resolvedSeasonId, teamId)
        applyRoster(seasonRosterToPlayers(entries, teamId))
      } catch (err) {
        const message =
          err && typeof err === 'object' && 'message' in err
            ? String((err as { message: unknown }).message)
            : 'Failed to load roster'
        throw new Error(message)
      } finally {
        setRosterLoading(false)
      }
    },
    [applyRoster, activeSeason?.id],
  )

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setLoadError(null)
      try {
        const [teamsData, coachesData, seasonsData, activeSeasonData, clubStaffNames] =
          await Promise.all([
            fetchTeams({ includeArchived: true }),
            fetchCoaches(),
            fetchSeasons(),
            fetchActiveSeason(),
            fetchClubStaffCoachNames().catch(() => [] as string[]),
          ])

        if (cancelled) return

        setTeams(teamsData)
        setCoaches(coachesData)
        setSeasons(seasonsData)
        setActiveSeasonState(activeSeasonData)
        setClubStaffCoachNames(clubStaffNames)

        let resolvedTeamId: string | null = null
        if (teamsData.length > 0) {
          const activeTeams = teamsData.filter((team) => team.active_status !== false)
          const selectable = activeTeams.length > 0 ? activeTeams : teamsData
          const persistedTeamId = readPersistedActiveTeamId()
          const persistedTeam = persistedTeamId
            ? selectable.find((team) => team.id === persistedTeamId)
            : null
          resolvedTeamId = persistedTeam?.id ?? selectable[0]?.id ?? null
        }

        const active = resolvedTeamId ? await fetchActiveMatch(resolvedTeamId) : null
        if (cancelled) return

        const seasonIdForRoster =
          active?.match.season_id ?? activeSeasonData?.id ?? null

        if (active) {
          const { match, team, coach, stats } = active
          const entries = seasonIdForRoster
            ? await fetchSeasonRosterPlayers(seasonIdForRoster, match.team_id, {
                includeInactive: true,
              })
            : []
          if (cancelled) return

          const roster = seasonRosterToPlayers(entries, match.team_id)
          const rosterIds = new Set(roster.map((p) => p.id))
          const missingIds = stats
            .map((s) => s.player_id)
            .filter((id) => id && !rosterIds.has(id))
          if (missingIds.length > 0) {
            const guests = await fetchPlayersByIds(missingIds)
            for (const guest of guests) {
              roster.push(
                poolPlayerToGuestRoster(guest, match.team_id),
              )
            }
          }
          const matchPlayers = rebuildMatchPlayers(roster, stats).filter(
            (player) => player.attending,
          )
          let playersWithCards = matchPlayers
          let shotSaveTotals = {
            homeShots: 0,
            awayShots: 0,
            homeSaves: 0,
            awaySaves: 0,
            homeCorners: 0,
            awayCorners: 0,
          }
          try {
            const events = await fetchMatchEvents(match.id)
            if (!cancelled) {
              playersWithCards = applyCardsFromEvents(matchPlayers, events)
              shotSaveTotals = aggregateTeamShotSaveTotals(events)
            }
            const backfill = await backfillMissingGoalShots(match.id)
            if (!cancelled && backfill.inserted > 0) {
              shotSaveTotals = backfill.totals
            }
          } catch (cardErr) {
            console.warn('[bootstrap] could not restore card state', cardErr)
          }
          if (cancelled) return

          setSelectedTeamId(match.team_id)
          resolvedTeamId = match.team_id
          setMasterRoster(roster)
          setMatchId(match.id)
          setSessionMatchTeamId(match.team_id)
          setMatchStatus('live')
          setAppMode('home')
          setPlayers(playersWithCards)
          setHomeScore(match.home_score)
          setAwayScore(match.away_score)
          setHomeShots(shotSaveTotals.homeShots)
          setAwayShots(shotSaveTotals.awayShots)
          setHomeSaves(shotSaveTotals.homeSaves)
          setAwaySaves(shotSaveTotals.awaySaves)
          setHomeCorners(shotSaveTotals.homeCorners)
          setAwayCorners(shotSaveTotals.awayCorners)
          setSeconds(
            restoreMatchClockSeconds(
              match.clock_seconds,
              parseQualitativeContext(match.qualitative_context).addedTimeSeconds,
            ),
          )
          applyMatchPeriodState(match)
          setPeriodClockStarted(match.period_clock_started)
          setSubIntervalSeconds(match.sub_interval_seconds ?? null)
          setGkPlaysFullHalf(match.gk_plays_full_half !== false)
          setMatchTeamName(formatTeamDisplayName(team.name, team.age_group))
          setMatchCoachName(resolveMatchCoachName(match, coach))
          setSetupCoachName(resolveMatchCoachName(match, coach))
          setMatchOpponent(match.opponent)
          setMatchLocationType(resolveMatchLocationType(match))
          setMatchTournamentGame(match.tournament_game)
          setMatchIsTest(Boolean(match.is_test))
          setMatchGoesToPks(Boolean(match.goes_to_pks))
          setHomePkScore(match.home_pk_score ?? 0)
          setAwayPkScore(match.away_pk_score ?? 0)
          setPkWinnerIsUs(match.pk_winner_is_us ?? null)
          setPkGkPlayerId(match.pk_gk_player_id ?? null)
          setLocationType(resolveMatchLocationType(match))
          setMatchDate(match.match_date ?? defaultMatchDate())
          setMatchTime(normalizeMatchTimeForInput(match.match_time))
          setFirstHalfStarterIds(
            stats.filter((s) => s.is_first_half_starter).map((s) => s.player_id),
          )
          setSecondHalfStarterIds(
            stats.filter((s) => s.is_second_half_starter).map((s) => s.player_id),
          )
        } else if (resolvedTeamId) {
          setSelectedTeamId(resolvedTeamId)
          persistActiveTeamId(resolvedTeamId)
        }

        if (resolvedTeamId) {
          if (seasonIdForRoster) {
            const entries = await fetchSeasonRosterPlayers(seasonIdForRoster, resolvedTeamId)
            if (!cancelled) {
              applyRoster(seasonRosterToPlayers(entries, resolvedTeamId))
            }
          } else if (!cancelled) {
            applyRoster([])
          }
        }
      } catch (err) {
        if (!cancelled) {
          const message =
            err && typeof err === 'object' && 'message' in err
              ? String((err as { message: unknown }).message)
              : 'Failed to load from Supabase'
          setLoadError(message)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const prev = setupCoachPrefillRef.current
    const enteredSetup =
      appMode === 'match_setup' &&
      (prev.appMode !== 'match_setup' || prev.teamId !== selectedTeamId)

    setupCoachPrefillRef.current = { appMode, teamId: selectedTeamId }

    if (!enteredSetup || !selectedTeamId) return

    let cancelled = false
    const team = teams.find((entry) => entry.id === selectedTeamId)
    const fallback = team?.primary_coach_name?.trim() ?? ''

    void (async () => {
      try {
        const staff = await fetchTeamCoachingStaff(selectedTeamId)
        if (cancelled) return
        setTeamCoachingStaff(staff)
        const preferred = staff.headCoaches[0] ?? staff.assistants[0] ?? fallback
        const known = new Set(
          [...staff.headCoaches, ...staff.assistants, ...clubStaffCoachNames].map((n) =>
            n.toLowerCase(),
          ),
        )
        // Never keep a free-typed / unknown name (e.g. accidental "Tisan") as the default.
        const preferredOk =
          preferred && known.has(preferred.toLowerCase())
            ? preferred
            : (staff.headCoaches[0] ?? '')
        setSetupCoachName(preferredOk)
      } catch {
        if (cancelled) return
        setTeamCoachingStaff({ headCoaches: [], assistants: [] })
        const fallbackOk =
          fallback &&
          clubStaffCoachNames.some((n) => n.toLowerCase() === fallback.toLowerCase())
            ? fallback
            : ''
        setSetupCoachName(fallbackOk)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [appMode, selectedTeamId, teams, clubStaffCoachNames])

  useEffect(() => {
    if (appMode !== 'match_setup' || !selectedTeamId) return

    let cancelled = false

    void (async () => {
      try {
        await loadTeamRoster(selectedTeamId)
      } catch (err) {
        if (!cancelled) {
          console.warn('[match_setup] roster load failed', err)
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [appMode, selectedTeamId, loadTeamRoster])

  useEffect(() => {
    const ids = masterRoster.map((p) => p.id)
    setSetupLineup((prev) => ensureSetupLineup(ids, prev))
    setMatchPositions((prev) => ensureMatchPositions(masterRoster, prev))
  }, [masterRoster])

  useEffect(() => {
    if (!selectedTeamId || (appMode !== 'match_setup' && appMode !== 'team' && appMode !== 'reporting' && appMode !== 'recap_history' && appMode !== 'halftime' && appMode !== 'match')) return

    let cancelled = false
    void (async () => {
      try {
        const presets = await fetchLineupPresetsByTeamId(selectedTeamId)
        if (!cancelled) setLineupPresets(presets)
      } catch (err) {
        console.warn('[lineup presets] failed to load', err)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [selectedTeamId, appMode])

  const loadFullTeamRoster = useCallback(async () => {
    if (!selectedTeamId || !activeSeason) {
      setTeamRoster([])
      return
    }
    setRosterLoading(true)
    try {
      const entries = await fetchSeasonRosterPlayers(activeSeason.id, selectedTeamId, {
        includeInactive: true,
      })
      setTeamRoster(seasonRosterToPlayers(entries, selectedTeamId))
    } finally {
      setRosterLoading(false)
    }
  }, [selectedTeamId, activeSeason])

  const refreshLineupPresets = useCallback(async () => {
    if (!selectedTeamId) {
      setLineupPresets([])
      return
    }
    const presets = await fetchLineupPresetsByTeamId(selectedTeamId)
    setLineupPresets(presets)
  }, [selectedTeamId])

  const refreshScheduledMatches = useCallback(async () => {
    if (!selectedTeamId) {
      setScheduledMatches([])
      return
    }
    setScheduledLoading(true)
    try {
      const matches = await fetchScheduledMatchesByTeamId(selectedTeamId)
      setScheduledMatches(matches)
    } finally {
      setScheduledLoading(false)
    }
  }, [selectedTeamId])

  useEffect(() => {
    void refreshScheduledMatches()
  }, [refreshScheduledMatches])

  const createScheduledMatch = useCallback(
    async (input: {
      opponent: string
      locationType: LocationType
      matchDate: string
      matchTime: string
    }) => {
      if (!selectedTeamId) throw new Error('Select a team before importing matches')
      const coachName =
        teams.find((entry) => entry.id === selectedTeamId)?.primary_coach_name?.trim() || ''
      const coachId = coachName ? await resolveCoachIdForName(coachName) : null
      if (!activeSeason) throw new Error('No active season — create one in Club Admin')
      const created = await createScheduledMatchRecord({
        teamId: selectedTeamId,
        seasonId: activeSeason.id,
        coachId,
        coachName,
        opponent: input.opponent,
        locationType: input.locationType,
        matchDate: input.matchDate,
        matchTime: input.matchTime,
      })
      setScheduledMatches((prev) =>
        [...prev, created].sort((a, b) => {
          const aKey = `${a.match_date ?? a.date.slice(0, 10)}T${normalizeMatchTimeForInput(a.match_time)}`
          const bKey = `${b.match_date ?? b.date.slice(0, 10)}T${normalizeMatchTimeForInput(b.match_time)}`
          return aKey.localeCompare(bKey)
        }),
      )
      return created
    },
    [selectedTeamId, teams, activeSeason],
  )

  const removeScheduledMatch = useCallback(async (matchId: string) => {
    await deleteMatchRecord(matchId)
    setScheduledMatches((prev) => prev.filter((match) => match.id !== matchId))
  }, [])

  const loadScheduledMatchIntoSetup = useCallback(
    (match: DbMatch) => {
      setOpponent(match.opponent)
      setLocationType(resolveMatchLocationType(match))
      setTournamentGame(Boolean(match.tournament_game))
      setIsTestMatch(Boolean(match.is_test))
      setGoesToPks(Boolean(match.goes_to_pks) && Boolean(match.tournament_game))
      applyMatchPeriodState(match)
      setMatchDate(match.match_date ?? match.date.slice(0, 10))
      setMatchTime(normalizeMatchTimeForInput(match.match_time))
      const coach =
        match.coach_name?.trim() ||
        teams.find((entry) => entry.id === selectedTeamId)?.primary_coach_name?.trim() ||
        ''
      if (coach) setSetupCoachName(coach)
      setAppMode('match_setup')
    },
    [selectedTeamId, teams, applyMatchPeriodState],
  )

  const clearEditingScheduledMatch = useCallback(() => {
    pendingScheduledSetupRef.current = null
    setEditingScheduledMatchId(null)
    setOpeningScheduledEditId(null)
  }, [])

  const editScheduledMatch = useCallback(
    async (matchId: string) => {
      setOpeningScheduledEditId(matchId)
      try {
        const bundle = await fetchMatchBundleById(matchId)
        if (!bundle) throw new Error('Could not load the scheduled match')
        const { match, team, stats } = bundle
        if (match.status !== 'scheduled') {
          throw new Error('That match is no longer scheduled')
        }

        const seasonIdForRoster = match.season_id ?? activeSeason?.id ?? null
        const entries = seasonIdForRoster
          ? await fetchSeasonRosterPlayers(seasonIdForRoster, match.team_id, {
              includeInactive: true,
            })
          : []
        const roster = seasonRosterToPlayers(entries, match.team_id)
        const rosterIds = new Set(roster.map((player) => player.id))
        const missingIds = stats
          .map((row) => row.player_id)
          .filter((id) => id && !rosterIds.has(id))
        const extraPlayers =
          missingIds.length > 0
            ? (await fetchPlayersByIds(missingIds)).map((guest) =>
                poolPlayerToGuestRoster(guest, match.team_id),
              )
            : []
        const matchPlayers = rebuildMatchPlayers([...roster, ...extraPlayers], stats)

        const attending: Record<string, boolean> = {}
        const startFirstHalf: Record<string, boolean> = {}
        const positions: MatchPositionsConfig = {}
        for (const player of matchPlayers) {
          attending[player.id] = player.attending
          startFirstHalf[player.id] = player.isFirstHalfStarter || player.isOnField
          positions[player.id] = player.matchPosition
        }

        const teamFormat = normalizeTeamFormat(team.format)
        const rawContext =
          match.qualitative_context && typeof match.qualitative_context === 'object'
            ? (match.qualitative_context as Record<string, unknown>)
            : null
        const preloadFormation =
          typeof rawContext?.preloadFormation === 'string'
            ? rawContext.preloadFormation.trim()
            : ''
        const formationId = resolveFormationIdForFormat(
          preloadFormation || matchFormations.first,
          teamFormat,
        )
        const starters = matchPlayers
          .filter((player) => player.isFirstHalfStarter || player.isOnField)
          .map((player) => ({ playerId: player.id, position: player.matchPosition }))

        pendingScheduledSetupRef.current = {
          extraPlayers,
          lineup: { attending, startFirstHalf },
          positions,
          formationId,
          slotAssignments: slotAssignmentsFromMatchPositions(formationId, starters, teamFormat),
        }

        setSelectedTeamId(match.team_id)
        setOpponent(match.opponent)
        setLocationType(resolveMatchLocationType(match))
        setTournamentGame(Boolean(match.tournament_game))
        setIsTestMatch(Boolean(match.is_test))
        setGoesToPks(Boolean(match.goes_to_pks) && Boolean(match.tournament_game))
        applyMatchPeriodState(match)
        setMatchDate(match.match_date ?? match.date.slice(0, 10))
        setMatchTime(normalizeMatchTimeForInput(match.match_time))
        setGkPlaysFullHalf(match.gk_plays_full_half !== false)
        setSetupSubIntervalMinutes(
          typeof match.sub_interval_seconds === 'number' && match.sub_interval_seconds > 0
            ? Math.round(match.sub_interval_seconds / 60)
            : null,
        )
        const coach =
          match.coach_name?.trim() ||
          team.primary_coach_name?.trim() ||
          ''
        if (coach) setSetupCoachName(coach)
        setEditingScheduledMatchId(match.id)
        setAppMode('match_setup')
      } finally {
        setOpeningScheduledEditId(null)
      }
    },
    [activeSeason, applyMatchPeriodState, matchFormations.first],
  )

  const applyLineupPreset = useCallback(
    (preset: DbLineupPreset) => {
      const team = teams.find((t) => t.id === selectedTeamId)
      const format = normalizeTeamFormat(team?.format)
      const applied = applyPresetToSetup(preset, masterRoster, format)
      setSetupLineup(applied.setupLineup)
      setMatchPositions(applied.matchPositions)
      setFirstHalfFormation(applied.formationId)
      setSetupSlotAssignments(applied.slotAssignments)
      setSetupSlotLabelOverrides(applied.slotLabelOverrides)
      setSetupPitchKey((k) => k + 1)
    },
    [masterRoster, setFirstHalfFormation, teams, selectedTeamId],
  )

  const applyHalftimeLineupPreset = useCallback(
    (preset: DbLineupPreset) => {
      const team = teams.find((t) => t.id === selectedTeamId)
      const format = normalizeTeamFormat(team?.format)
      const attendingPlayers = players.filter((player) => player.attending)
      const applied = applyPresetToHalftime(preset, attendingPlayers, format)

      setMatchFormations((prev) => ({ ...prev, second: applied.formationId }))
      setHalftimeSlotAssignments(applied.slotAssignments)
      setHalftimeSlotLabelOverrides(applied.slotLabelOverrides)
      setHalftimeSecondHalf(applied.starters)
      setPlayers((prev) =>
        prev.map((player) => {
          const nextPosition = applied.matchPositions[player.id]
          return nextPosition ? { ...player, matchPosition: nextPosition } : player
        }),
      )
      setHalftimePitchKey((key) => key + 1)
    },
    [players, teams, selectedTeamId],
  )

  const saveLineupPreset = useCallback(
    async (input: {
      presetId?: string
      presetName: string
      formationId: string
      slotAssignments: Record<string, string | null>
      slotLabelOverrides?: Record<string, string>
    }) => {
      if (!selectedTeamId) throw new Error('Select a team first')
      const team = teams.find((t) => t.id === selectedTeamId)
      const format = normalizeTeamFormat(team?.format)
      validatePresetFormation(input.formationId, format)
      const formationJson = buildFormationJson(
        input.formationId,
        input.slotAssignments,
        input.slotLabelOverrides,
      )
      if (input.presetId) {
        await updateLineupPreset(input.presetId, {
          presetName: input.presetName,
          formationJson,
        })
      } else {
        await insertLineupPreset({
          teamId: selectedTeamId,
          presetName: input.presetName,
          formationJson,
        })
      }
      await refreshLineupPresets()
    },
    [selectedTeamId, refreshLineupPresets, teams],
  )

  const removeLineupPreset = useCallback(
    async (presetId: string) => {
      await deleteLineupPreset(presetId)
      await refreshLineupPresets()
    },
    [refreshLineupPresets],
  )

  const syncSessionMatchForTeam = useCallback(
    async (teamId: string) => {
      const gen = ++sessionMatchSyncGenRef.current
      const active = await fetchActiveMatch(teamId)
      if (gen !== sessionMatchSyncGenRef.current) return

      if (!active) {
        setMatchId(null)
        setSessionMatchTeamId(null)
        setMatchStatus(null)
        setMatchTeamName('')
        setMatchOpponent('')
        setPlayers([])
        releaseLocalClock()
        setPeriodClockStarted(false)
        setRunning(false)
        return
      }

      const { match, team } = active
      setMatchId(match.id)
      setSessionMatchTeamId(match.team_id)
      setMatchStatus(match.status)
      setMatchTeamName(formatTeamDisplayName(team.name, team.age_group))
      setMatchOpponent(match.opponent)
    },
    [releaseLocalClock],
  )

  const setActiveTeamId = useCallback(
    (teamId: string) => {
      setSelectedTeamId(teamId)
      persistActiveTeamId(teamId)
      setMasterRoster([])
      setSetupLineup({ attending: {}, startFirstHalf: {} })
      setMatchPositions({})
      setSetupSlotAssignments(undefined)
      setSetupSlotLabelOverrides(undefined)
      setSetupPitchKey((k) => k + 1)
      const team = teams.find((t) => t.id === teamId)
      const format = normalizeTeamFormat(team?.format)
      const defaultFormation = getDefaultFormationId(format)
      setMatchFormations({ first: defaultFormation, second: defaultFormation })
      void loadTeamRoster(teamId)
      void syncSessionMatchForTeam(teamId)
    },
    [loadTeamRoster, syncSessionMatchForTeam, teams],
  )

  const selectTeam = setActiveTeamId

  const createTeam = useCallback(async (input: { name?: string; ageGroup: AgeGroup }) => {
    const rawName =
      input.name?.trim() || defaultTeamNameForAgeGroup(input.ageGroup)
    const name =
      stripAgeGroupFromTeamName(rawName, input.ageGroup) ||
      defaultTeamNameForAgeGroup(input.ageGroup)
    const team = await insertTeam({ name, ageGroup: input.ageGroup })
    setTeams((prev) =>
      [...prev, team].sort((a, b) =>
        formatTeamDisplayName(a.name, a.age_group).localeCompare(
          formatTeamDisplayName(b.name, b.age_group),
        ),
      ),
    )
    selectTeam(team.id)
    return team.id
  }, [selectTeam])

  const activeTeamAgeGroup = useMemo(() => {
    const team = teams.find((entry) => entry.id === selectedTeamId)
    return normalizeAgeGroup(team?.age_group)
  }, [teams, selectedTeamId])

  const updateTeamAgeGroup = useCallback(
    async (ageGroup: AgeGroup) => {
      if (!selectedTeamId) throw new Error('Select a team first')
      const updated = await updateTeamAgeGroupApi(selectedTeamId, ageGroup)
      setTeams((prev) => prev.map((team) => (team.id === updated.id ? updated : team)))
      const format = formatForAgeGroup(ageGroup)
      const defaultFormation = getDefaultFormationId(format)
      setMatchFormations((prev) => ({
        first: isFormationValidForFormat(prev.first, format) ? prev.first : defaultFormation,
        second: isFormationValidForFormat(prev.second, format) ? prev.second : defaultFormation,
      }))
      setSetupSlotAssignments(undefined)
      setSetupSlotLabelOverrides(undefined)
      setSetupPitchKey((k) => k + 1)
      return updated
    },
    [selectedTeamId],
  )

  const updateTeamProfile = useCallback(
    async (teamId: string, input: { name: string; ageGroup: AgeGroup }) => {
      const rawName = input.name.trim()
      const name =
        stripAgeGroupFromTeamName(rawName, input.ageGroup) || rawName
      if (!name) throw new Error('Team name is required')
      const updated = await updateTeamProfileApi(teamId, {
        name,
        ageGroup: input.ageGroup,
      })
      setTeams((prev) =>
        prev
          .map((team) => (team.id === updated.id ? updated : team))
          .sort((a, b) =>
            formatTeamDisplayName(a.name, a.age_group).localeCompare(
              formatTeamDisplayName(b.name, b.age_group),
            ),
          ),
      )
      if (teamId === selectedTeamId) {
        const format = formatForAgeGroup(input.ageGroup)
        const defaultFormation = getDefaultFormationId(format)
        setMatchFormations((prev) => ({
          first: isFormationValidForFormat(prev.first, format) ? prev.first : defaultFormation,
          second: isFormationValidForFormat(prev.second, format) ? prev.second : defaultFormation,
        }))
        setSetupSlotAssignments(undefined)
        setSetupSlotLabelOverrides(undefined)
        setSetupPitchKey((k) => k + 1)
      }
      return updated
    },
    [selectedTeamId],
  )

  const setTeamActive = useCallback(
    async (teamId: string, active: boolean) => {
      const updated = await setTeamActiveStatus(teamId, active)
      setTeams((prev) =>
        prev
          .map((team) => (team.id === teamId ? updated : team))
          .sort((a, b) => a.name.localeCompare(b.name)),
      )
      if (!active && selectedTeamId === teamId) {
        setSelectedTeamId(null)
        setMasterRoster([])
        setLineupPresets([])
        setScheduledMatches([])
      }
      return updated
    },
    [selectedTeamId],
  )

  /** @deprecated Prefer setTeamActive(teamId, false) */
  const removeTeam = useCallback(
    async (teamId: string) => {
      await setTeamActive(teamId, false)
    },
    [setTeamActive],
  )

  const activeTeamPrimaryCoachName = useMemo(() => {
    const team = teams.find((entry) => entry.id === selectedTeamId)
    return team?.primary_coach_name?.trim() ?? ''
  }, [teams, selectedTeamId])

  const activeTeamFormat = useMemo(() => {
    const team = teams.find((t) => t.id === selectedTeamId)
    return normalizeTeamFormat(team?.format)
  }, [teams, selectedTeamId])

  // Default state is the 9v9 3-3-2. A 7v7 team (U9/U10) must never keep that
  // shape — it draws nine slots with only seven allowed on the field.
  useEffect(() => {
    if (!selectedTeamId) return
    setMatchFormations((prev) => {
      const first = resolveFormationIdForFormat(prev.first, activeTeamFormat)
      const second = resolveFormationIdForFormat(prev.second, activeTeamFormat)
      if (first === prev.first && second === prev.second) return prev
      return { first, second }
    })
  }, [activeTeamFormat, selectedTeamId])

  const activeTeamScope = useMemo(
    (): TeamScope | null =>
      resolveTeamScope(
        selectedTeamId,
        teams.map((team) => ({
          id: team.id,
          name: formatTeamDisplayName(team.name, team.age_group),
        })),
      ),
    [selectedTeamId, teams],
  )

  const updateTeamPrimaryCoach = useCallback(
    async (primaryCoachName: string) => {
      if (!selectedTeamId) throw new Error('Select a team first')
      const updated = await updateTeamPrimaryCoachNameApi(selectedTeamId, primaryCoachName)
      setTeams((prev) => prev.map((team) => (team.id === updated.id ? updated : team)))
      return updated
    },
    [selectedTeamId],
  )

  const updateTeamFormat = useCallback(
    async (format: TeamFormat) => {
      if (!selectedTeamId) throw new Error('Select a team first')
      const updated = await updateTeamFormatApi(selectedTeamId, format)
      setTeams((prev) => prev.map((team) => (team.id === updated.id ? updated : team)))
      const defaultFormation = getDefaultFormationId(format)
      setMatchFormations((prev) => ({
        first: isFormationValidForFormat(prev.first, format) ? prev.first : defaultFormation,
        second: isFormationValidForFormat(prev.second, format) ? prev.second : defaultFormation,
      }))
      setSetupSlotAssignments(undefined)
      setSetupSlotLabelOverrides(undefined)
      setSetupPitchKey((k) => k + 1)
    },
    [selectedTeamId],
  )

  const setPlayerAttending = useCallback((id: string, attending: boolean) => {
    setSetupLineup((prev) => ({
      attending: { ...prev.attending, [id]: attending },
      startFirstHalf: attending ? prev.startFirstHalf : { ...prev.startFirstHalf, [id]: false },
    }))
  }, [])

  const setStartFirstHalf = useCallback((id: string, starts: boolean) => {
    setSetupLineup((prev) => ({
      ...prev,
      startFirstHalf: { ...prev.startFirstHalf, [id]: starts },
      attending: starts ? { ...prev.attending, [id]: true } : prev.attending,
    }))
  }, [])

  const addPlayer = useCallback(
    async (input: {
      firstName: string
      lastName: string
      jersey: number | null
      isGuest: boolean
      position?: string
      primaryPosition?: string
      secondaryPosition?: string
      ageGroup?: AgeGroup
    }) => {
      if (!selectedTeamId) throw new Error('Select a team before adding players')
      if (!activeSeason) throw new Error('No active season — create one in Club Admin')

      const team = teams.find((entry) => entry.id === selectedTeamId)
      const ageGroup = input.ageGroup ?? resolveTeamAgeGroup(team?.age_group)

      const created = await upsertPlayer({
        teamId: selectedTeamId,
        seasonId: activeSeason.id,
        ageGroup,
        firstName: input.firstName,
        lastName: input.lastName,
        jersey: input.jersey,
        isGuest: false,
        position: input.position,
        primaryPosition: input.primaryPosition,
        secondaryPosition: input.secondaryPosition,
      })
      const rosterPlayer = dbPlayerToRoster(created, {
        teamId: selectedTeamId,
        jersey: input.jersey,
        isGuest: false,
      })
      setMasterRoster((prev) =>
        [...prev, rosterPlayer].sort((a, b) => (a.number ?? 999) - (b.number ?? 999)),
      )
      setTeamRoster((prev) =>
        [...prev, rosterPlayer].sort((a, b) => (a.number ?? 999) - (b.number ?? 999)),
      )
      setSetupLineup((prev) => ({
        attending: { ...prev.attending, [created.id]: true },
        startFirstHalf: { ...prev.startFirstHalf, [created.id]: false },
      }))
      setMatchPositions((prev) => ({
        ...prev,
        [created.id]: ensureMatchPositions([rosterPlayer])[created.id],
      }))
      return rosterPlayer
    },
    [selectedTeamId, activeSeason, teams],
  )

  const addGuestFromPool = useCallback(
    async (playerId: string) => {
      if (!selectedTeamId) throw new Error('Select a team first')
      const existing = masterRoster.find((p) => p.id === playerId)
      if (existing) {
        setSetupLineup((prev) => ({
          ...prev,
          attending: { ...prev.attending, [playerId]: true },
        }))
        return existing
      }
      const [player] = await fetchPlayersByIds([playerId])
      if (!player) throw new Error('Player not found in pool')
      const rosterPlayer = poolPlayerToGuestRoster(player, selectedTeamId)
      setMasterRoster((prev) =>
        [...prev, rosterPlayer].sort((a, b) => (a.number ?? 999) - (b.number ?? 999)),
      )
      setSetupLineup((prev) => ({
        attending: { ...prev.attending, [player.id]: true },
        startFirstHalf: { ...prev.startFirstHalf, [player.id]: false },
      }))
      setMatchPositions((prev) => ({
        ...prev,
        [player.id]: ensureMatchPositions([rosterPlayer])[player.id],
      }))
      return rosterPlayer
    },
    [selectedTeamId, masterRoster],
  )

  const updatePlayer = useCallback(
    async (
      id: string,
      updates: {
        firstName: string
        lastName: string
        jersey: number | null
        isGuest: boolean
        primaryPosition?: string
        secondaryPosition?: string
        ageGroup?: AgeGroup
      },
    ) => {
      const existing = masterRoster.find((p) => p.id === id) ?? teamRoster.find((p) => p.id === id)
      if (!existing) throw new Error('Player not found')

      const ageGroup = updates.ageGroup ?? resolveTeamAgeGroup(existing.ageGroup)
      const updated = await upsertPlayer({
        id,
        teamId: selectedTeamId || existing.teamId || undefined,
        seasonId: activeSeason?.id,
        ageGroup,
        firstName: updates.firstName,
        lastName: updates.lastName,
        jersey: updates.jersey,
        isGuest: existing.isGuest,
        primaryPosition: updates.primaryPosition ?? existing.primaryPosition,
        secondaryPosition: updates.secondaryPosition ?? existing.secondaryPosition,
      })
      const rosterPlayer = dbPlayerToRoster(updated, {
        teamId: selectedTeamId ?? existing.teamId,
        jersey: updates.jersey,
        isGuest: existing.isGuest,
      })
      setMasterRoster((prev) =>
        prev
          .map((p) => (p.id === id ? rosterPlayer : p))
          .filter((p) => p.activeStatus)
          .sort((a, b) => (a.number ?? 999) - (b.number ?? 999)),
      )
      setTeamRoster((prev) =>
        prev
          .map((p) => (p.id === id ? rosterPlayer : p))
          .sort((a, b) => (a.number ?? 999) - (b.number ?? 999)),
      )
      return rosterPlayer
    },
    [masterRoster, teamRoster, selectedTeamId, activeSeason?.id],
  )

  const setPlayerActive = useCallback(
    async (id: string, active: boolean) => {
      const updated = await setPlayerActiveStatus(id, active)
      const rosterPlayer = dbPlayerToRoster(updated, {
        teamId: selectedTeamId ?? '',
        jersey: updated.jersey,
        isGuest: false,
      })
      setTeamRoster((prev) =>
        prev
          .map((p) => (p.id === id ? rosterPlayer : p))
          .sort((a, b) => (a.number ?? 999) - (b.number ?? 999)),
      )
      if (active) {
        setMasterRoster((prev) =>
          [...prev.filter((p) => p.id !== id), rosterPlayer].sort(
            (a, b) => (a.number ?? 999) - (b.number ?? 999),
          ),
        )
      } else {
        setMasterRoster((prev) => prev.filter((p) => p.id !== id))
        setSetupLineup((prev) => ({
          attending: { ...prev.attending, [id]: false },
          startFirstHalf: { ...prev.startFirstHalf, [id]: false },
        }))
      }
    },
    [],
  )

  const beginMatch = useCallback(
    async (input: {
      teamId: string
      teamName: string
      coachName: string
      opponent: string
      locationType: LocationType
      tournamentGame: boolean
      isTest?: boolean
      goesToPks?: boolean
      halfLength: number
      totalPeriods?: TotalPeriods
      matchDate: string
      matchTime: string
      attendingPlayers: RosterPlayer[]
      absentPlayers?: RosterPlayer[]
      firstHalfStarterIds: string[]
      matchPositions: Record<string, string>
      firstHalfFormation: string
      subIntervalSeconds?: number | null
      gkPlaysFullHalf?: boolean
    }) => {
      const existing = await fetchActiveMatch(input.teamId)
      if (existing) {
        await completeMatch(existing.match.id)
      }

      let createdMatchId: string | null = null
      const goesToPks = Boolean(input.tournamentGame && input.goesToPks)
      const allowsThree = supportsThreePeriodFormat({
        ageGroup: teams.find((t) => t.id === input.teamId)?.age_group,
        teamFormat: normalizeTeamFormat(teams.find((t) => t.id === input.teamId)?.format),
      })
      const matchTotalPeriods: TotalPeriods =
        input.tournamentGame || !allowsThree
          ? 2
          : input.totalPeriods === 3
            ? 3
            : 2

      try {
        const coachId = await resolveCoachIdForName(input.coachName)
        if (!activeSeason) throw new Error('No active season — create one in Club Admin')
        const match = await createMatchRecord({
          teamId: input.teamId,
          seasonId: activeSeason.id,
          coachId,
          coachName: input.coachName,
          opponent: input.opponent,
          locationType: input.locationType,
          tournamentGame: input.tournamentGame,
          isTest: Boolean(input.isTest),
          goesToPks,
          halfLength: input.halfLength,
          periodLength: input.halfLength,
          totalPeriods: matchTotalPeriods,
          matchDate: input.matchDate,
          matchTime: input.matchTime,
          subIntervalSeconds: input.subIntervalSeconds ?? null,
          gkPlaysFullHalf: input.gkPlaysFullHalf ?? true,
          status: 'live',
        })
        createdMatchId = match.id

        const matchPlayers = await createMatchStats(
          match.id,
          input.attendingPlayers,
          input.firstHalfStarterIds,
          input.matchPositions,
          input.firstHalfFormation,
          input.absentPlayers ?? [],
        )

        setMatchId(match.id)
        setSessionMatchTeamId(input.teamId)
        setMatchStatus('live')
        setAppMode('match')
        setPlayers(matchPlayers)
        setHomeScore(0)
        setAwayScore(0)
        setHomeShots(0)
        setAwayShots(0)
        setHomeSaves(0)
        setAwaySaves(0)
        setHomeCorners(0)
        setAwayCorners(0)
        setHomePkScore(0)
        setAwayPkScore(0)
        setPkWinnerIsUs(null)
        setPkGkPlayerId(null)
        setSeconds(initialHalfClock(input.halfLength))
        setPeriod('1st')
        setCurrentPeriod(1)
        setTotalPeriods(matchTotalPeriods)
        localIntermissionRef.current = false
        releaseLocalClock()
        setPeriodClockStarted(false)
        setFirstHalfStarterIds(input.firstHalfStarterIds)
        setSecondHalfStarterIds([])
        setHalftimeSecondHalf({})
        setMatchFormations({
          first: resolveFormationIdForFormat(
            input.firstHalfFormation,
            normalizeTeamFormat(teams.find((team) => team.id === input.teamId)?.format),
          ),
          second: resolveFormationIdForFormat(
            input.firstHalfFormation,
            normalizeTeamFormat(teams.find((team) => team.id === input.teamId)?.format),
          ),
        })
        setMatchTeamName(input.teamName)
        setMatchCoachName(input.coachName)
        setMatchOpponent(input.opponent)
        setMatchLocationType(input.locationType)
        setMatchTournamentGame(input.tournamentGame)
        setMatchIsTest(Boolean(input.isTest))
        setMatchGoesToPks(goesToPks)
        setHalfLengthMinutes(input.halfLength)
        setSubIntervalSeconds(input.subIntervalSeconds ?? null)
        setGkPlaysFullHalf(input.gkPlaysFullHalf ?? true)

        return match.id
      } catch (err) {
        if (createdMatchId) {
          try {
            await deleteMatchRecord(createdMatchId)
          } catch (cleanupErr) {
            console.error('[beginMatch] failed to roll back match record', cleanupErr)
          }
        }
        throw err
      }
    },
    [activeSeason, teams],
  )

  /** Preload a fixture + lineup as `scheduled` — no clock, events, or parent push. */
  const schedulePreloadedMatch = useCallback(
    async (input: {
      teamId: string
      coachName: string
      opponent: string
      locationType: LocationType
      tournamentGame: boolean
      isTest?: boolean
      goesToPks?: boolean
      halfLength: number
      totalPeriods?: TotalPeriods
      matchDate: string
      matchTime: string
      attendingPlayers: RosterPlayer[]
      absentPlayers?: RosterPlayer[]
      firstHalfStarterIds: string[]
      matchPositions: Record<string, string>
      firstHalfFormation: string
      subIntervalSeconds?: number | null
      gkPlaysFullHalf?: boolean
      existingMatchId?: string
      navigateHome?: boolean
    }) => {
      const goesToPks = Boolean(input.tournamentGame && input.goesToPks)
      const allowsThree = supportsThreePeriodFormat({
        ageGroup: teams.find((t) => t.id === input.teamId)?.age_group,
        teamFormat: normalizeTeamFormat(teams.find((t) => t.id === input.teamId)?.format),
      })
      const matchTotalPeriods: TotalPeriods =
        input.tournamentGame || !allowsThree
          ? 2
          : input.totalPeriods === 3
            ? 3
            : 2
      const matchTimeDb =
        input.matchTime.trim().length === 5
          ? `${input.matchTime.trim()}:00`
          : input.matchTime.trim() || null

      if (input.existingMatchId) {
        const coachId = await resolveCoachIdForName(input.coachName)
        await updateMatchRecord(input.existingMatchId, {
          opponent: input.opponent,
          location: input.locationType,
          location_type: input.locationType,
          tournament_game: input.tournamentGame,
          is_test: Boolean(input.isTest),
          goes_to_pks: goesToPks,
          half_length: input.halfLength,
          period_length: input.halfLength,
          total_periods: matchTotalPeriods,
          match_date: input.matchDate.trim() || null,
          match_time: matchTimeDb,
          date: matchDateTimeIso(input.matchDate, input.matchTime),
          coach_id: coachId,
          coach_name: input.coachName.trim() || null,
          sub_interval_seconds: input.subIntervalSeconds ?? null,
          gk_plays_full_half: input.gkPlaysFullHalf ?? true,
        })
        await replaceMatchStats(
          input.existingMatchId,
          input.attendingPlayers,
          input.firstHalfStarterIds,
          input.matchPositions,
          input.firstHalfFormation,
          input.absentPlayers ?? [],
        )
        await saveQualitativeContext(input.existingMatchId, {
          preloadFormation: input.firstHalfFormation,
        })
        setScheduledMatches((prev) =>
          prev
            .map((row) =>
              row.id === input.existingMatchId
                ? {
                    ...row,
                    opponent: input.opponent,
                    location: input.locationType,
                    location_type: input.locationType,
                    tournament_game: input.tournamentGame,
                    is_test: Boolean(input.isTest),
                    goes_to_pks: goesToPks,
                    half_length: input.halfLength,
                    period_length: input.halfLength,
                    total_periods: matchTotalPeriods,
                    match_date: input.matchDate.trim() || null,
                    match_time: matchTimeDb,
                    date: matchDateTimeIso(input.matchDate, input.matchTime),
                    coach_name: input.coachName.trim() || row.coach_name,
                    sub_interval_seconds: input.subIntervalSeconds ?? null,
                    gk_plays_full_half: input.gkPlaysFullHalf ?? true,
                  }
                : row,
            )
            .sort((a, b) => getMatchSortTimestamp(a) - getMatchSortTimestamp(b)),
        )
        setEditingScheduledMatchId(null)
        if (input.navigateHome !== false) setAppMode('home')
        return input.existingMatchId
      }

      let createdMatchId: string | null = null
      try {
        const coachId = await resolveCoachIdForName(input.coachName)
        if (!activeSeason) throw new Error('No active season — create one in Club Admin')
        const match = await createMatchRecord({
          teamId: input.teamId,
          seasonId: activeSeason.id,
          coachId,
          coachName: input.coachName,
          opponent: input.opponent,
          locationType: input.locationType,
          tournamentGame: input.tournamentGame,
          isTest: Boolean(input.isTest),
          goesToPks,
          halfLength: input.halfLength,
          periodLength: input.halfLength,
          totalPeriods: matchTotalPeriods,
          matchDate: input.matchDate,
          matchTime: input.matchTime,
          subIntervalSeconds: input.subIntervalSeconds ?? null,
          gkPlaysFullHalf: input.gkPlaysFullHalf ?? true,
          status: 'scheduled',
        })
        createdMatchId = match.id

        await createMatchStats(
          match.id,
          input.attendingPlayers,
          input.firstHalfStarterIds,
          input.matchPositions,
          input.firstHalfFormation,
          input.absentPlayers ?? [],
        )

        await saveQualitativeContext(match.id, {
          preloadFormation: input.firstHalfFormation,
        })

        setScheduledMatches((prev) =>
          [...prev.filter((row) => row.id !== match.id), match].sort(
            (a, b) => getMatchSortTimestamp(a) - getMatchSortTimestamp(b),
          ),
        )
        setAppMode('home')
        return match.id
      } catch (err) {
        if (createdMatchId) {
          try {
            await deleteMatchRecord(createdMatchId)
          } catch (cleanupErr) {
            console.error('[schedulePreloadedMatch] rollback failed', cleanupErr)
          }
        }
        throw err
      }
    },
    [activeSeason, teams],
  )

  /**
   * Promote a scheduled match to live and open the 1st-half ready screen.
   * Clock, stints, and kickoff push start only when the coach taps Start Half.
   */
  const startLiveMatch = useCallback(
    async (scheduledMatchId: string) => {
      const scheduled = await fetchMatchBundleById(scheduledMatchId)
      if (!scheduled) throw new Error('Could not load the scheduled match')

      const existingLive = await fetchActiveMatch(scheduled.match.team_id)
      if (existingLive && existingLive.match.id !== scheduledMatchId) {
        throw new Error('Finish or resume the current live match before starting another.')
      }

      const promoted =
        existingLive?.match.id === scheduledMatchId
          ? existingLive.match
          : await promoteScheduledMatchToLive(scheduledMatchId)

      const bundle =
        existingLive?.match.id === scheduledMatchId
          ? existingLive
          : await fetchMatchBundleById(promoted.id)
      if (!bundle) throw new Error('Could not load the scheduled match')

      const { match, team, coach, stats } = bundle
      const seasonIdForRoster = match.season_id ?? activeSeason?.id ?? null
      const entries = seasonIdForRoster
        ? await fetchSeasonRosterPlayers(seasonIdForRoster, match.team_id, {
            includeInactive: true,
          })
        : []
      const roster = seasonRosterToPlayers(entries, match.team_id)
      const rosterIds = new Set(roster.map((p) => p.id))
      const missingIds = stats
        .map((s) => s.player_id)
        .filter((id) => id && !rosterIds.has(id))
      if (missingIds.length > 0) {
        const guests = await fetchPlayersByIds(missingIds)
        for (const guest of guests) {
          roster.push(poolPlayerToGuestRoster(guest, match.team_id))
        }
      }

      const matchPlayers = rebuildMatchPlayers(roster, stats).filter((player) => player.attending)
      const rawContext =
        match.qualitative_context && typeof match.qualitative_context === 'object'
          ? (match.qualitative_context as Record<string, unknown>)
          : null
      const preloadFormation =
        typeof rawContext?.preloadFormation === 'string' ? rawContext.preloadFormation.trim() : ''
      const formation = resolveFormationIdForFormat(
        preloadFormation || matchFormations.first,
        normalizeTeamFormat(team.format),
      )

      const halfLen = match.period_length ?? match.half_length
      const clock = initialHalfClock(halfLen)
      await syncMatchRecord(match.id, {
        period_clock_started: false,
        clock_seconds: clock,
        current_period: 1,
        period: '1st',
      })

      const starterIds = matchPlayers.filter((p) => p.isOnField).map((p) => p.id)
      const matchTotalPeriods: TotalPeriods = match.total_periods === 3 ? 3 : 2

      setSelectedTeamId(match.team_id)
      setMasterRoster(roster)
      setMatchId(match.id)
      setSessionMatchTeamId(match.team_id)
      setMatchStatus('live')
      setAppMode('match')
      setPlayers(matchPlayers)
      setHomeScore(match.home_score)
      setAwayScore(match.away_score)
      setHomeShots(0)
      setAwayShots(0)
      setHomeSaves(0)
      setAwaySaves(0)
      setHomeCorners(0)
      setAwayCorners(0)
      setHomePkScore(match.home_pk_score ?? 0)
      setAwayPkScore(match.away_pk_score ?? 0)
      setPkWinnerIsUs(match.pk_winner_is_us)
      setPkGkPlayerId(match.pk_gk_player_id ?? null)
      setSeconds(clock)
      setPeriod('1st')
      setCurrentPeriod(1)
      setTotalPeriods(matchTotalPeriods)
      localIntermissionRef.current = false
      releaseLocalClock()
      setPeriodClockStarted(false)
      setFirstHalfStarterIds(starterIds)
      setSecondHalfStarterIds([])
      setHalftimeSecondHalf({})
      setMatchFormations({
        first: formation,
        second: formation,
      })
      setMatchTeamName(formatTeamDisplayName(team.name, team.age_group))
      setMatchCoachName(
        match.coach_name?.trim() ||
          coach?.name?.trim() ||
          team.primary_coach_name?.trim() ||
          '',
      )
      setMatchOpponent(match.opponent)
      setMatchLocationType(resolveMatchLocationType(match))
      setMatchTournamentGame(Boolean(match.tournament_game))
      setMatchIsTest(Boolean(match.is_test))
      setMatchGoesToPks(Boolean(match.goes_to_pks) && Boolean(match.tournament_game))
      setHalfLengthMinutes(halfLen)
      setSubIntervalSeconds(match.sub_interval_seconds ?? null)
      setGkPlaysFullHalf(match.gk_plays_full_half !== false)
      setScheduledMatches((prev) => prev.filter((row) => row.id !== match.id))

      return {
        matchId: match.id,
        teamId: match.team_id,
        teamName: formatTeamDisplayName(team.name, team.age_group),
        opponent: match.opponent,
        starters: matchPlayers.filter((p) => p.isOnField),
        currentPeriod: 1,
        totalPeriods: matchTotalPeriods,
      }
    },
    [activeSeason, matchFormations.first],
  )

  /** End the active period and open intermission lineup (PERIOD_X → INTERMISSION). */
  const enterIntermission = useCallback(
    async (
      clockSeconds: number,
      slotAssignments?: Record<string, string | null>,
      slotLabelOverrides?: Record<string, string>,
    ) => {
      localIntermissionRef.current = true
      releaseLocalClock()

      let nextPlayers: MatchPlayer[] = []
      let toggles: Record<string, boolean> = {}

      setPlayers((prev) => {
        const finalized = finalizeAllOnField(prev, clockSeconds)
        const attendingIds = finalized.filter((p) => p.attending).map((p) => p.id)
        const onFieldById = Object.fromEntries(
          finalized.filter((p) => p.attending).map((p) => [p.id, p.isOnField]),
        )
        toggles = ensureHalftimeStarters(attendingIds, onFieldById)

        nextPlayers = finalized.map((p) =>
          p.attending ? { ...p, isOnField: false, subbedInAt: null } : p,
        )

        return nextPlayers
      })

      setHalftimeSlotAssignments(
        hasSlotAssignments(slotAssignments) ? slotAssignments : {},
      )
      if (slotLabelOverrides && Object.keys(slotLabelOverrides).length > 0) {
        setHalftimeSlotLabelOverrides(slotLabelOverrides)
      }
      setHalftimeSecondHalf(toggles)
      setHalftimePitchKey(0)
      // Carry the formation that just ended into the next-period lineup editor.
      setMatchFormations((prev) => {
        const current =
          periodRef.current === '1st' ? prev.first : prev.second
        return { ...prev, second: current }
      })
      setPeriodClockStarted(false)
      setAppMode('halftime')
      return nextPlayers
    },
    [releaseLocalClock],
  )

  /** @deprecated Prefer enterIntermission — kept for call sites still using the old name. */
  const enterHalftime = enterIntermission

  const setHalftimeStarter = useCallback((id: string, starts: boolean) => {
    setHalftimeSecondHalf((prev) => ({ ...prev, [id]: starts }))
  }, [])

  /** Start the next period after intermission (INTERMISSION → PERIOD_X+1). */
  const beginNextPeriod = useCallback(
    async (
      slotAssignments?: Record<string, string | null>,
      slotLabelOverrides?: Record<string, string> | null,
    ) => {
      localIntermissionRef.current = false
      claimLocalClock()
      const newClock = initialHalfClock(halfLengthMinutes)
      const formation = resolveFormationIdForFormat(
        matchFormationsRef.current.second,
        activeTeamFormat,
      )
      const nextPeriodIndex = Math.min(totalPeriods, currentPeriod + 1)
      const nextPeriodCode = periodIndexToCode(nextPeriodIndex)

      const assignmentIds = hasSlotAssignments(slotAssignments)
        ? Object.values(slotAssignments).filter((id): id is string => Boolean(id))
        : []
      const toggleIds = Object.entries(halftimeSecondHalf)
        .filter(([, starts]) => starts)
        .map(([id]) => id)

      const starterIds = new Set(assignmentIds.length > 0 ? assignmentIds : toggleIds)

      if (hasSlotAssignments(slotAssignments)) {
        setSecondHalfSlotAssignments(slotAssignments)
      }

      const prevPlayers = liveStateRef.current.players
      let linedUp = applySecondHalfLineup(prevPlayers, starterIds)
      if (hasSlotAssignments(slotAssignments)) {
        linedUp = applySlotAssignmentPositions(
          linedUp,
          slotAssignments,
          formation,
          slotLabelOverrides,
          activeTeamFormat,
        )
      }
      const stamped = stampAllOnField(linedUp, newClock)
      setPlayers(stamped)
      liveStateRef.current = {
        ...liveStateRef.current,
        appMode: 'match',
        players: stamped,
        seconds: newClock,
        periodClockStarted: true,
        running: true,
      }

      setSecondHalfStarterIds([...starterIds])
      setCurrentPeriod(nextPeriodIndex)
      setPeriod(nextPeriodCode)
      setSeconds(newClock)
      claimLocalClock()
      setPeriodClockStarted(true)
      setAppMode('match')

      return {
        starters: stamped.filter((p) => starterIds.has(p.id)),
        period: nextPeriodIndex,
        periodCode: nextPeriodCode,
        clockSeconds: newClock,
        formation,
      }
    },
    [
      activeTeamFormat,
      halftimeSecondHalf,
      halfLengthMinutes,
      totalPeriods,
      currentPeriod,
      setPeriod,
      setSeconds,
      claimLocalClock,
      setPeriodClockStarted,
    ],
  )

  /** @deprecated Prefer beginNextPeriod */
  const beginSecondHalf = beginNextPeriod

  const finishGame = useCallback(
    async (
      clockSeconds: number,
      timing?: { endedOnTime: boolean },
      options?: { enterPenaltyShootout?: boolean },
    ) => {
      localIntermissionRef.current = false
      releaseLocalClock()

      const onFieldPlayerIds = players
        .filter((p) => p.attending && p.isOnField)
        .map((p) => p.id)
      const formation = getActiveFormation()
      const teamSlug =
        teams.find((entry) => entry.id === selectedTeamId)?.slug?.trim() || null

      if (matchId) {
        const result = await apiEndRegulation({
          matchId,
          clockSeconds,
          halfLengthMinutes,
          formation,
          endedOnTime: timing?.endedOnTime ?? null,
          enterPenaltyShootout: options?.enterPenaltyShootout ?? false,
          onFieldPlayerIds,
          homeScore,
          awayScore,
          teamName: matchTeamName.trim() || 'Home',
          opponent: matchOpponent,
          teamSlug,
          sendFullTimePush: !options?.enterPenaltyShootout,
        })
        if (!result.ok) {
          throw new Error(result.error)
        }
      }

      setPlayers((prev) => {
        const finalized = finalizeAllOnField(prev, clockSeconds).map((p) =>
          p.attending && p.isOnField ? { ...p, isOnField: false, subbedInAt: null } : p,
        )

        if (matchId) {
          void syncMatchStats(matchId, finalized)
        }

        return finalized
      })

      if (options?.enterPenaltyShootout) {
        setHomePkScore(0)
        setAwayPkScore(0)
        setPkWinnerIsUs(null)
        setPkGkPlayerId(null)
        setPeriodClockStarted(false)
        setMatchStatus('live')
        setAppMode('penalty_shootout')
        return
      }

      setMatchStatus('pending_review')
      setAppMode('recap')
    },
    [
      matchId,
      halfLengthMinutes,
      releaseLocalClock,
      getActiveFormation,
      players,
      teams,
      selectedTeamId,
      homeScore,
      awayScore,
      matchTeamName,
      matchOpponent,
    ],
  )

  const finalizePenaltyShootout = useCallback(
    async (input: {
      homePkScore: number
      awayPkScore: number
      pkWinnerIsUs: boolean
    }) => {
      if (matchId) {
        const teamSlug =
          teams.find((entry) => entry.id === selectedTeamId)?.slug?.trim() || null
        const result = await apiFinalizePk({
          matchId,
          homePkScore: input.homePkScore,
          awayPkScore: input.awayPkScore,
          pkWinnerIsUs: input.pkWinnerIsUs,
          homeScore,
          awayScore,
          teamName: matchTeamName.trim() || 'Home',
          opponent: matchOpponent,
          teamSlug,
        })
        if (!result.ok) {
          throw new Error(result.error)
        }
      }
      setHomePkScore(input.homePkScore)
      setAwayPkScore(input.awayPkScore)
      setPkWinnerIsUs(input.pkWinnerIsUs)
      setMatchStatus('pending_review')
      setAppMode('recap')
    },
    [matchId, teams, selectedTeamId, homeScore, awayScore, matchTeamName, matchOpponent],
  )

  const returnToHome = useCallback(() => {
    setAppMode('home')
    setPlayers([])
    setHomeScore(0)
    setAwayScore(0)
    setHomeShots(0)
    setAwayShots(0)
    setHomeSaves(0)
    setAwaySaves(0)
    setHomeCorners(0)
    setAwayCorners(0)
    setSeconds(0)
    setPeriod('1st')
    setCurrentPeriod(1)
    setTotalPeriods(DEFAULT_TOTAL_PERIODS)
    setHalfLengthMinutes(DEFAULT_HALF_LENGTH)
    localIntermissionRef.current = false
    releaseLocalClock()
    setPeriodClockStarted(false)
    setFirstHalfStarterIds([])
    setSecondHalfStarterIds([])
    setHalftimeSecondHalf({})
    setHalftimeSlotAssignments({})
    setHalftimeSlotLabelOverrides({})
    setSecondHalfSlotAssignments({})
    setSetupSlotAssignments(undefined)
    setSetupSlotLabelOverrides(undefined)
    setSetupPitchKey((k) => k + 1)
    setHalftimePitchKey(0)
    setMatchTeamName('')
    setMatchCoachName('')
    setSetupCoachName('')
    setMatchOpponent('')
    setMatchLocationType('home')
    setMatchTournamentGame(false)
    setMatchIsTest(false)
    setMatchGoesToPks(false)
    setHomePkScore(0)
    setAwayPkScore(0)
    setPkWinnerIsUs(null)
    setPkGkPlayerId(null)
    setLocationType('home')
    setTournamentGame(false)
    setIsTestMatch(false)
    setGoesToPks(false)
    setMatchFormations({
      first: getDefaultFormationId(activeTeamFormat),
      second: getDefaultFormationId(activeTeamFormat),
    })
    setMatchDate(defaultMatchDate())
    setMatchTime(defaultMatchTime())
    setMatchId(null)
    setSessionMatchTeamId(null)
    setMatchStatus(null)
  }, [activeTeamFormat])

  /** Permanently delete a match (+ cascaded child rows) and clear local state if active. */
  const deleteMatch = useCallback(
    async (targetMatchId: string) => {
      await deleteMatchRecord(targetMatchId)
      setScheduledMatches((prev) => prev.filter((match) => match.id !== targetMatchId))
      if (matchId === targetMatchId) {
        returnToHome()
      }
    },
    [matchId, returnToHome],
  )

  const openMatchRecap = useCallback(async (targetMatchId: string) => {
    const bundle = await fetchMatchRecapBundle(targetMatchId)
    if (!bundle) throw new Error('Match not found')

    const { match, team, coach, stats } = bundle
    if (match.status !== 'pending_review' && match.status !== 'final') {
      throw new Error('Recap is only available for finished matches')
    }

    const seasonId = match.season_id || activeSeason?.id
    const entries = seasonId
      ? await fetchSeasonRosterPlayers(seasonId, match.team_id, { includeInactive: true })
      : []
    const roster = seasonRosterToPlayers(entries, match.team_id)
    const rosterIds = new Set(roster.map((p) => p.id))
    const missingIds = stats.map((s) => s.player_id).filter((id) => id && !rosterIds.has(id))
    if (missingIds.length > 0) {
      const guests = await fetchPlayersByIds(missingIds)
      for (const guest of guests) {
        roster.push(poolPlayerToGuestRoster(guest, match.team_id))
      }
    }
    const matchPlayers = rebuildMatchPlayers(roster, stats).filter((player) => player.attending)

    setSelectedTeamId(match.team_id)
    setMasterRoster(roster)
    setMatchId(match.id)
    setSessionMatchTeamId(match.team_id)
    setMatchStatus(match.status)
    setPlayers(matchPlayers)
    setHomeScore(match.home_score)
    setAwayScore(match.away_score)
    setHomePkScore(match.home_pk_score ?? 0)
    setAwayPkScore(match.away_pk_score ?? 0)
    setPkWinnerIsUs(match.pk_winner_is_us ?? null)
    setPkGkPlayerId(match.pk_gk_player_id ?? null)
    setSeconds(
      restoreMatchClockSeconds(
        match.clock_seconds,
        parseQualitativeContext(match.qualitative_context).addedTimeSeconds,
      ),
    )
    applyMatchPeriodState(match)
    setPeriodClockStarted(match.period_clock_started)
    setSubIntervalSeconds(match.sub_interval_seconds ?? null)
    setGkPlaysFullHalf(match.gk_plays_full_half !== false)
    setMatchTeamName(formatTeamDisplayName(team.name, team.age_group))
    setMatchCoachName(resolveMatchCoachName(match, coach))
    setMatchOpponent(match.opponent)
    setMatchLocationType(resolveMatchLocationType(match))
    setMatchTournamentGame(match.tournament_game)
    setMatchIsTest(Boolean(match.is_test))
    setMatchGoesToPks(Boolean(match.goes_to_pks))
    setFirstHalfStarterIds(stats.filter((s) => s.is_first_half_starter).map((s) => s.player_id))
    setSecondHalfStarterIds(stats.filter((s) => s.is_second_half_starter).map((s) => s.player_id))
    setAppMode('recap')
  }, [applyMatchPeriodState])

  /** @deprecated Use openMatchRecap */
  const openPendingReviewRecap = openMatchRecap

  const endMatch = useCallback(async () => {
    if (matchId) {
      await completeMatch(matchId)
    }
    returnToHome()
  }, [matchId, returnToHome])

  const createPoolPlayer = useCallback(
    async (input: {
      firstName: string
      lastName: string
      jersey: number | null
      ageGroup: AgeGroup
      primaryPosition?: string
      secondaryPosition?: string
    }) => {
      return upsertPlayer({
        ageGroup: input.ageGroup,
        firstName: input.firstName,
        lastName: input.lastName,
        jersey: input.jersey,
        isGuest: false,
        primaryPosition: input.primaryPosition,
        secondaryPosition: input.secondaryPosition,
      })
    },
    [],
  )

  const setSetupMatchPosition = useCallback((id: string, matchPosition: string) => {
    setMatchPositions((prev) => ({ ...prev, [id]: normalizeRecapPosition(matchPosition) }))
  }, [])

  const createSeasonRecord = useCallback(
    async (input: { name: string; startsOn?: string | null; endsOn?: string | null }) => {
      const created = await createSeason({
        name: input.name,
        startsOn: input.startsOn ?? null,
        endsOn: input.endsOn ?? null,
      })
      setSeasons((prev) => [created, ...prev])
      return created
    },
    [],
  )

  const updateSeasonRecord = useCallback(
    async (
      seasonId: string,
      input: { name: string; startsOn?: string | null; endsOn?: string | null },
    ) => {
      const updated = await updateSeason(seasonId, {
        name: input.name,
        startsOn: input.startsOn ?? null,
        endsOn: input.endsOn ?? null,
      })
      setSeasons((prev) => prev.map((season) => (season.id === updated.id ? updated : season)))
      if (activeSeason?.id === updated.id) {
        setActiveSeasonState(updated)
      }
      return updated
    },
    [activeSeason?.id],
  )

  const activateSeason = useCallback(async (seasonId: string) => {
    const activated = await setActiveSeason(seasonId)
    setActiveSeasonState(activated)
    setSeasons((prev) =>
      prev.map((season) =>
        season.id === activated.id
          ? activated
          : season.status === 'active'
            ? { ...season, status: 'archived' }
            : season,
      ),
    )
    if (selectedTeamId) {
      await loadTeamRoster(selectedTeamId, activated.id)
    }
    return activated
  }, [selectedTeamId, loadTeamRoster])

  const archiveSeasonRecord = useCallback(async (seasonId: string) => {
    const archived = await archiveSeason(seasonId)
    setSeasons((prev) => prev.map((season) => (season.id === archived.id ? archived : season)))
    if (activeSeason?.id === seasonId) {
      setActiveSeasonState(null)
    }
    return archived
  }, [activeSeason?.id])

  return {
    loading,
    loadError,
    rosterLoading,
    teams,
    coaches,
    seasons,
    activeSeason,
    masterRoster,
    appMode,
    setAppMode,
    hydrateLiveMatch,
    resumeLiveMatchScreen,
    persistMatchClock,
    noteLocalMatchMutation,
    claimLocalClock,
    releaseLocalClock,
    isLocalClockOwned,
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
    setPeriod,
    currentPeriod,
    totalPeriods,
    setTotalPeriods,
    running,
    setRunning,
    periodClockStarted,
    setPeriodClockStarted,
    firstHalfStarterIds,
    setFirstHalfStarterIds,
    secondHalfStarterIds,
    halftimeSecondHalf,
    setHalftimeStarter,
    halftimeSlotAssignments,
    halftimeSlotLabelOverrides,
    secondHalfSlotAssignments,
    setSecondHalfSlotAssignments,
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
    enterIntermission,
    beginSecondHalf,
    beginNextPeriod,
    finishGame,
    finalizePenaltyShootout,
    returnToHome,
    openMatchRecap,
    openPendingReviewRecap,
    matchStatus,
    hasLiveMatch: isSessionMatchForSelectedTeam(
      matchStatus,
      matchId,
      sessionMatchTeamId,
      selectedTeamId,
      'live',
    ),
    hasPendingRecap: isSessionMatchForSelectedTeam(
      matchStatus,
      matchId,
      sessionMatchTeamId,
      selectedTeamId,
      'pending_review',
    ),
    selectedTeamId,
    activeTeamId: selectedTeamId,
    activeTeamScope,
    activeTeamFormat,
    activeTeamAgeGroup,
    selectTeam,
    setActiveTeamId,
    updateTeamFormat,
    updateTeamAgeGroup,
    updateTeamPrimaryCoach,
    activeTeamPrimaryCoachName,
    setupCoachName,
    setSetupCoachName,
    teamCoachingStaff,
    clubStaffCoachNames,
    matchTeamName,
    matchCoachName,
    matchOpponent,
    setMatchOpponent,
    matchLocationType,
    setMatchLocationType,
    matchTournamentGame,
    matchIsTest,
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
    getActiveFormation,
    setPlayerAttending,
    setStartFirstHalf,
    createTeam,
    updateTeamProfile,
    setTeamActive,
    removeTeam,
    addPlayer,
    addGuestFromPool,
    updatePlayer,
    beginMatch,
    schedulePreloadedMatch,
    startLiveMatch,
    endMatch,
    setSetupMatchPosition,
    createSeasonRecord,
    updateSeasonRecord,
    activateSeason,
    archiveSeasonRecord,
    createPoolPlayer,
    fetchAgeGroupPoolPlayers,
    assignPlayerToSeasonRoster,
    removePlayerFromSeasonRoster,
    scheduledMatches,
    scheduledLoading,
    refreshScheduledMatches,
    createScheduledMatch,
    removeScheduledMatch,
    loadScheduledMatchIntoSetup,
    editScheduledMatch,
    clearEditingScheduledMatch,
    editingScheduledMatchId,
    openingScheduledEditId,
    deleteMatch,
  }
}
