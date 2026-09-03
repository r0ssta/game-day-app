import { useCallback, useEffect, useRef, useState } from 'react'
import { useRoster } from '@/hooks/useRoster'
import { useStaffAuth } from '@/hooks/useStaffAuth'
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
} from '@/lib/formations'
import { applyPresetToSetup, applyPresetToHalftime } from '@/lib/lineup-presets'
import {
  normalizeTeamFormat,
  type TeamFormat,
} from '@/lib/team-format'
import {
  type AgeGroup,
  formatTeamDisplayName,
} from '@/lib/age-groups'
import {
  completeMatch,
  createMatchRecord,
  createMatchStats,
  deleteMatchRecord,
  fetchActiveMatch,
  fetchMatchBundleById,
  promoteScheduledMatchToLive,
  saveQualitativeContext,
  fetchActiveSeason,
  fetchPlayersByIds,
  fetchCoaches,
  fetchClubStaffCoachNames,
  fetchMatchRecapBundle,
  fetchSeasonRosterPlayers,
  fetchSeasons,
  fetchTeams,
  rebuildMatchPlayers,
  fetchMatchEvents,
  backfillMissingGoalShots,
  resolveCoachIdForName,
  resolveMatchCoachName,
  syncMatchClock,
  syncMatchRecord,
  syncMatchStats,
} from '@/lib/supabase-api'
import type { DbLineupPreset, DbMatch } from '@/types/database'
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
} from '@/lib/team-context'
import {
  poolPlayerToGuestRoster,
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

export function useMatchState() {
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [appMode, setAppMode] = useState<AppMode>('home')
  const setupResetRef = useRef<(roster: RosterPlayer[]) => void>(() => {})
  const teamShapeRef = useRef<(format: TeamFormat) => void>(() => {})
  const onApplyRoster = useCallback((nextRoster: RosterPlayer[]) => {
    setupResetRef.current(nextRoster)
  }, [])
  const onTeamShapeChange = useCallback((format: TeamFormat) => {
    teamShapeRef.current(format)
  }, [])

  const roster = useRoster({
    appMode,
    onApplyRoster,
    onTeamShapeChange,
  })
  const staff = useStaffAuth({
    selectedTeamId: roster.selectedTeamId,
    teams: roster.teams,
    appMode,
    setTeams: roster.setTeams,
  })

  const {
    rosterLoading,
    teams,
    setTeams,
    seasons,
    setSeasons,
    activeSeason,
    setActiveSeasonState,
    masterRoster,
    setMasterRoster,
    teamRoster,
    lineupPresets,
    scheduledMatches,
    setScheduledMatches,
    scheduledLoading,
    selectedTeamId,
    setSelectedTeamId,
    applyRoster,
    loadTeamRoster,
    loadFullTeamRoster,
    refreshLineupPresets,
    refreshScheduledMatches,
    createScheduledMatch,
    removeScheduledMatch,
    createTeamRecord,
    updateTeamAgeGroup,
    updateTeamProfile,
    setTeamActive,
    removeTeam,
    updateTeamFormat,
    addPlayer: addPlayerToRoster,
    addGuestFromPool: addGuestToRoster,
    updatePlayer,
    setPlayerActiveOnRoster,
    saveLineupPreset,
    removeLineupPreset,
    createSeasonRecord,
    updateSeasonRecord,
    activateSeason,
    archiveSeasonRecord,
    createPoolPlayer,
    fetchAgeGroupPoolPlayers,
    assignPlayerToSeasonRoster,
    removePlayerFromSeasonRoster,
    activeTeamAgeGroup,
    activeTeamFormat,
    activeTeamScope,
    persistSelectedTeamId,
  } = roster

  const {
    coaches,
    setCoaches,
    setupCoachName,
    setSetupCoachName,
    teamCoachingStaff,
    clubStaffCoachNames,
    setClubStaffCoachNames,
    activeTeamPrimaryCoachName,
    updateTeamPrimaryCoach,
  } = staff

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
  const [setupSlotAssignments, setSetupSlotAssignments] = useState<
    Record<string, string | null> | undefined
  >(undefined)
  const [setupSlotLabelOverrides, setSetupSlotLabelOverrides] = useState<
    Record<string, string> | undefined
  >(undefined)
  const [setupPitchKey, setSetupPitchKey] = useState(0)
  const [halftimePitchKey, setHalftimePitchKey] = useState(0)

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

  setupResetRef.current = (roster) => {
    setSetupLineup(createDefaultSetupLineup(roster.map((p) => p.id)))
    setMatchPositions(ensureMatchPositions(roster))
  }
  teamShapeRef.current = (format) => {
    const defaultFormation = getDefaultFormationId(format)
    setMatchFormations((prev) => ({
      first: isFormationValidForFormat(prev.first, format) ? prev.first : defaultFormation,
      second: isFormationValidForFormat(prev.second, format) ? prev.second : defaultFormation,
    }))
    setSetupSlotAssignments(undefined)
    setSetupSlotLabelOverrides(undefined)
    setSetupPitchKey((k) => k + 1)
  }

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

        const active = await fetchActiveMatch()
        if (cancelled) return

        let resolvedTeamId: string | null = null
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
        } else if (teamsData.length > 0) {
          const activeTeams = teamsData.filter((team) => team.active_status !== false)
          const selectable = activeTeams.length > 0 ? activeTeams : teamsData
          const persistedTeamId = readPersistedActiveTeamId()
          const persistedTeam = persistedTeamId
            ? selectable.find((team) => team.id === persistedTeamId)
            : null
          resolvedTeamId = persistedTeam?.id ?? selectable[0]?.id ?? null
          setSelectedTeamId(resolvedTeamId)
          if (resolvedTeamId) persistActiveTeamId(resolvedTeamId)
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
    const ids = masterRoster.map((p) => p.id)
    setSetupLineup((prev) => ensureSetupLineup(ids, prev))
    setMatchPositions((prev) => ensureMatchPositions(masterRoster, prev))
  }, [masterRoster])



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


  const setActiveTeamId = useCallback(
    (teamId: string) => {
      persistSelectedTeamId(teamId)
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
    },
    [loadTeamRoster, teams],
  )

  const selectTeam = setActiveTeamId


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

  const createTeam = useCallback(async (input: { name?: string; ageGroup: AgeGroup }) => {
    const team = await createTeamRecord(input)
    selectTeam(team.id)
    return team.id
  }, [createTeamRecord, selectTeam])

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
      const rosterPlayer = await addPlayerToRoster(input)
      setSetupLineup((prev) => ({
        attending: { ...prev.attending, [rosterPlayer.id]: true },
        startFirstHalf: { ...prev.startFirstHalf, [rosterPlayer.id]: false },
      }))
      setMatchPositions((prev) => ({
        ...prev,
        [rosterPlayer.id]: ensureMatchPositions([rosterPlayer])[rosterPlayer.id],
      }))
      return rosterPlayer
    },
    [addPlayerToRoster],
  )

  const addGuestFromPool = useCallback(
    async (playerId: string) => {
      const existing = masterRoster.find((p) => p.id === playerId)
      const rosterPlayer = await addGuestToRoster(playerId)
      if (existing) {
        setSetupLineup((prev) => ({
          ...prev,
          attending: { ...prev.attending, [playerId]: true },
        }))
        return existing
      }
      setSetupLineup((prev) => ({
        attending: { ...prev.attending, [rosterPlayer.id]: true },
        startFirstHalf: { ...prev.startFirstHalf, [rosterPlayer.id]: false },
      }))
      setMatchPositions((prev) => ({
        ...prev,
        [rosterPlayer.id]: ensureMatchPositions([rosterPlayer])[rosterPlayer.id],
      }))
      return rosterPlayer
    },
    [addGuestToRoster, masterRoster],
  )

  const setPlayerActive = useCallback(
    async (id: string, active: boolean) => {
      await setPlayerActiveOnRoster(id, active)
      if (!active) {
        setSetupLineup((prev) => ({
          attending: { ...prev.attending, [id]: false },
          startFirstHalf: { ...prev.startFirstHalf, [id]: false },
        }))
      }
    },
    [setPlayerActiveOnRoster],
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
      const existing = await fetchActiveMatch()
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
      const existingLive = await fetchActiveMatch()
      if (existingLive && existingLive.match.id !== scheduledMatchId) {
        throw new Error('Finish or resume the current live match before starting another.')
      }

      const promoted =
        existingLive?.match.id === scheduledMatchId
          ? existingLive.match
          : await promoteScheduledMatchToLive(scheduledMatchId)

      const bundle = await fetchMatchBundleById(promoted.id)
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


  const setSetupMatchPosition = useCallback((id: string, matchPosition: string) => {
    setMatchPositions((prev) => ({ ...prev, [id]: normalizeRecapPosition(matchPosition) }))
  }, [])


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
    hasLiveMatch: matchStatus === 'live' && Boolean(matchId),
    hasPendingRecap: matchStatus === 'pending_review' && Boolean(matchId),
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
    matchLocationType,
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
    deleteMatch,
  }
}
