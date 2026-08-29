import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  createDefaultSetupLineup,
  ensureHalftimeStarters,
  ensureSetupLineup,
} from '@/lib/lineup'
import { ensureMatchPositions, normalizeRecapPosition } from '@/lib/positions'
import {
  applySecondHalfLineup,
  applySlotAssignmentPositions,
  finalizeAllOnField,
  stampAllOnField,
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
  addedTimeSeconds,
  elapsedInHalf,
  initialHalfClock,
  persistableClockSeconds,
  restoreMatchClockSeconds,
} from '@/lib/match-clock'
import { parseQualitativeContext } from '@/lib/qualitative-context'
import type { SubFrequency } from '@/lib/sub-rotation'
import {
  DEFAULT_FORMATION_ID,
  getDefaultFormationId,
  isFormationValidForFormat,
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
  createScheduledMatchRecord,
  deleteMatchRecord,
  deleteLineupPreset,
  dbPlayerToRoster,
  ensureStartingLineupEvents,
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
  insertMatchEvent,
  mergeMatchTimingContext,
  markMatchPendingReview,
  rebuildMatchPlayers,
  fetchMatchEvents,
  resolveCoachIdForName,
  resolveMatchCoachName,
  syncMatchRecord,
  syncMatchStats,
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
import {
  poolPlayerToGuestRoster,
  resolveTeamAgeGroup,
  seasonRosterToPlayers,
} from '@/lib/season-roster'
import { applyCardsFromEvents } from '@/lib/match-cards'
import { PERIOD_END_NOTE, startingLineupNote } from '@/lib/match-event-notes'
import { aggregateTeamShotSaveTotals } from '@/lib/match-shot-save'
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
  const [running, setRunning] = useState(false)
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
  const setupCoachPrefillRef = useRef<{ appMode: AppMode; teamId: string | null }>({
    appMode: 'home',
    teamId: null,
  })

  useEffect(() => {
    periodRef.current = period
  }, [period])

  useEffect(() => {
    matchFormationsRef.current = matchFormations
  }, [matchFormations])

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

  const applyRoster = useCallback((roster: RosterPlayer[]) => {
    setMasterRoster(roster)
    setSetupLineup(createDefaultSetupLineup(roster.map((p) => p.id)))
    setMatchPositions(ensureMatchPositions(roster))
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
    },
    [loadTeamRoster, teams],
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
        setRunning(false)
        setPeriodClockStarted(false)
        setFirstHalfStarterIds(input.firstHalfStarterIds)
        setSecondHalfStarterIds([])
        setHalftimeSecondHalf({})
        setMatchFormations({
          first: input.firstHalfFormation,
          second: input.firstHalfFormation,
        })
        setMatchTeamName(input.teamName)
        setMatchCoachName(input.coachName)
        setMatchOpponent(input.opponent)
        setMatchLocationType(input.locationType)
        setMatchTournamentGame(input.tournamentGame)
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
          { writeStartingLineupEvents: false },
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
   * Promote a scheduled match to live, start the period clock, and hydrate coach UI.
   * Caller should fire the kickoff parent push after this resolves.
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
      const formation =
        preloadFormation ||
        matchFormations.first ||
        getDefaultFormationId(normalizeTeamFormat(team.format)) ||
        DEFAULT_FORMATION_ID

      await ensureStartingLineupEvents(match.id, matchPlayers, formation)
      const halfLen = match.period_length ?? match.half_length
      const clock = initialHalfClock(halfLen)
      await syncMatchRecord(match.id, {
        period_clock_started: true,
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
      setRunning(true)
      setPeriodClockStarted(true)
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
    async (clockSeconds: number, slotAssignments?: Record<string, string | null>) => {
      setRunning(false)

      if (matchId) {
        void mergeMatchTimingContext(matchId, {
          addedTimeSeconds: addedTimeSeconds(clockSeconds),
        })
      }

      let nextPlayers: MatchPlayer[] = []
      let toggles: Record<string, boolean> = {}

      setPlayers((prev) => {
        if (matchId) {
          const elapsed = elapsedInHalf(clockSeconds, halfLengthMinutes)
          const formation = getActiveFormation()
          for (const p of prev) {
            if (p.attending && p.isOnField) {
              void insertMatchEvent({
                matchId,
                playerId: p.id,
                eventType: 'sub_out',
                timestamp: elapsed,
                formation,
                eventNotes: PERIOD_END_NOTE,
              })
            }
          }
        }

        const finalized = finalizeAllOnField(prev, clockSeconds)
        const attendingIds = finalized.filter((p) => p.attending).map((p) => p.id)
        const onFieldById = Object.fromEntries(
          finalized.filter((p) => p.attending).map((p) => [p.id, p.isOnField]),
        )
        toggles = ensureHalftimeStarters(attendingIds, onFieldById)

        nextPlayers = finalized.map((p) =>
          p.attending ? { ...p, isOnField: false, subbedInAt: null } : p,
        )

        if (matchId) void syncMatchStats(matchId, nextPlayers)
        return nextPlayers
      })

      if (slotAssignments) setHalftimeSlotAssignments(slotAssignments)
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
    [matchId, halfLengthMinutes, setRunning, getActiveFormation],
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
      const newClock = initialHalfClock(halfLengthMinutes)
      const formation = matchFormationsRef.current.second
      const nextPeriodIndex = Math.min(totalPeriods, currentPeriod + 1)
      const nextPeriodCode = periodIndexToCode(nextPeriodIndex)

      const assignmentIds = slotAssignments
        ? Object.values(slotAssignments).filter((id): id is string => Boolean(id))
        : []
      const toggleIds = Object.entries(halftimeSecondHalf)
        .filter(([, starts]) => starts)
        .map(([id]) => id)

      const starterIds = new Set(assignmentIds.length > 0 ? assignmentIds : toggleIds)

      if (slotAssignments) {
        setSecondHalfSlotAssignments(slotAssignments)
      }

      setPlayers((prev) => {
        let linedUp = applySecondHalfLineup(prev, starterIds)
        if (slotAssignments && assignmentIds.length > 0) {
          linedUp = applySlotAssignmentPositions(
            linedUp,
            slotAssignments,
            formation,
            slotLabelOverrides,
          )
        }
        const stamped = stampAllOnField(linedUp, newClock)

        if (matchId) {
          for (const id of starterIds) {
            const starter = stamped.find((player) => player.id === id)
            void insertMatchEvent({
              matchId,
              playerId: id,
              eventType: 'sub_in',
              timestamp: 0,
              formation,
              eventNotes: startingLineupNote(starter?.matchPosition),
            })
          }
          void syncMatchStats(matchId, stamped)
        }

        return stamped
      })

      setSecondHalfStarterIds([...starterIds])
      setCurrentPeriod(nextPeriodIndex)
      setPeriod(nextPeriodCode)
      setSeconds(newClock)
      setRunning(true)
      setPeriodClockStarted(true)
      if (matchId) {
        void syncMatchRecord(matchId, {
          period: nextPeriodCode,
          current_period: nextPeriodIndex,
          total_periods: totalPeriods,
          period_length: halfLengthMinutes,
          half_length: halfLengthMinutes,
          clock_seconds: newClock,
          period_clock_started: true,
        })
        void mergeMatchTimingContext(matchId, { addedTimeSeconds: 0 })
      }
      setAppMode('match')
    },
    [
      halftimeSecondHalf,
      halfLengthMinutes,
      matchId,
      totalPeriods,
      currentPeriod,
      setPeriod,
      setSeconds,
      setRunning,
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
      setRunning(false)

      if (matchId) {
        void mergeMatchTimingContext(matchId, {
          addedTimeSeconds: addedTimeSeconds(clockSeconds),
          endedOnTime: timing?.endedOnTime ?? null,
        })
      }

      setPlayers((prev) => {
        if (matchId) {
          const elapsed = elapsedInHalf(clockSeconds, halfLengthMinutes)
          const formation = getActiveFormation()
          for (const p of prev) {
            if (p.attending && p.isOnField) {
              void insertMatchEvent({
                matchId,
                playerId: p.id,
                eventType: 'sub_out',
                timestamp: elapsed,
                formation,
                eventNotes: PERIOD_END_NOTE,
              })
            }
          }
        }

        const finalized = finalizeAllOnField(prev, clockSeconds).map((p) =>
          p.attending && p.isOnField ? { ...p, isOnField: false, subbedInAt: null } : p,
        )

        if (matchId) {
          void syncMatchStats(matchId, finalized)
          if (!options?.enterPenaltyShootout) {
            void markMatchPendingReview(matchId)
          }
        }

        return finalized
      })

      if (options?.enterPenaltyShootout) {
        setHomePkScore(0)
        setAwayPkScore(0)
        setPkWinnerIsUs(null)
        setPkGkPlayerId(null)
        if (matchId) {
          void syncMatchRecord(matchId, {
            home_pk_score: 0,
            away_pk_score: 0,
            pk_winner_is_us: null,
            pk_gk_player_id: null,
            period_clock_started: false,
            clock_seconds: persistableClockSeconds(clockSeconds),
          })
        }
        setPeriodClockStarted(false)
        setMatchStatus('live')
        setAppMode('penalty_shootout')
        return
      }

      setMatchStatus('pending_review')
      setAppMode('recap')
    },
    [matchId, halfLengthMinutes, setRunning, getActiveFormation],
  )

  const finalizePenaltyShootout = useCallback(
    async (input: {
      homePkScore: number
      awayPkScore: number
      pkWinnerIsUs: boolean
    }) => {
      setHomePkScore(input.homePkScore)
      setAwayPkScore(input.awayPkScore)
      setPkWinnerIsUs(input.pkWinnerIsUs)
      if (matchId) {
        await syncMatchRecord(matchId, {
          home_pk_score: input.homePkScore,
          away_pk_score: input.awayPkScore,
          pk_winner_is_us: input.pkWinnerIsUs,
          period_clock_started: false,
        })
        await markMatchPendingReview(matchId)
      }
      setMatchStatus('pending_review')
      setAppMode('recap')
    },
    [matchId],
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
    setRunning(false)
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
    setMatchGoesToPks(false)
    setHomePkScore(0)
    setAwayPkScore(0)
    setPkWinnerIsUs(null)
    setPkGkPlayerId(null)
    setLocationType('home')
    setTournamentGame(false)
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
