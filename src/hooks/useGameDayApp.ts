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
  normalizeMatchTimeForInput,
} from '@/lib/match-schedule'
import type { LocationType } from '@/lib/match-location'
import { resolveMatchLocationType } from '@/lib/match-location'
import { elapsedInHalf, initialHalfClock } from '@/lib/match-clock'
import {
  DEFAULT_FORMATION_ID,
  getDefaultFormationId,
  isFormationValidForFormat,
} from '@/lib/formations'
import { applyPresetToSetup, applyPresetToHalftime, validatePresetFormation } from '@/lib/lineup-presets'
import {
  normalizeTeamFormat,
  type TeamFormat,
} from '@/lib/team-format'
import {
  completeMatch,
  createMatchRecord,
  createMatchStats,
  deleteMatchRecord,
  deleteLineupPreset,
  dbPlayerToRoster,
  fetchActiveMatch,
  fetchCoaches,
  fetchLineupPresetsByTeamId,
  fetchMatchRecapBundle,
  fetchPlayersByTeamId,
  fetchTeams,
  insertCoach,
  insertLineupPreset,
  insertTeam,
  insertMatchEvent,
  markMatchPendingReview,
  rebuildMatchPlayers,
  resolveCoachIdForName,
  resolveMatchCoachName,
  syncMatchStats,
  updateLineupPreset,
  updateTeamFormat as updateTeamFormatApi,
  updateTeamPrimaryCoachName as updateTeamPrimaryCoachNameApi,
  upsertPlayer,
  setPlayerActiveStatus,
} from '@/lib/supabase-api'
import type { DbCoach, DbLineupPreset, DbMatch, DbTeam } from '@/types/database'
import type {
  AppMode,
  MatchPeriod,
  MatchPlayer,
  MatchFormations,
  MatchPositionsConfig,
  RosterPlayer,
  SetupLineup,
} from '@/types/match'

const DEFAULT_HALF_LENGTH = 30

export function useGameDayApp() {
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [rosterLoading, setRosterLoading] = useState(false)

  const [teams, setTeams] = useState<DbTeam[]>([])
  const [coaches, setCoaches] = useState<DbCoach[]>([])
  const [masterRoster, setMasterRoster] = useState<RosterPlayer[]>([])

  const [appMode, setAppMode] = useState<AppMode>('home')
  const [matchId, setMatchId] = useState<string | null>(null)
  const [matchStatus, setMatchStatus] = useState<DbMatch['status'] | null>(null)
  const [players, setPlayers] = useState<MatchPlayer[]>([])
  const [homeScore, setHomeScore] = useState(0)
  const [awayScore, setAwayScore] = useState(0)
  const [seconds, setSeconds] = useState(0)
  const [period, setPeriod] = useState<MatchPeriod>('1st')
  const [running, setRunning] = useState(false)
  const [periodClockStarted, setPeriodClockStarted] = useState(false)
  const [firstHalfStarterIds, setFirstHalfStarterIds] = useState<string[]>([])
  const [secondHalfStarterIds, setSecondHalfStarterIds] = useState<string[]>([])
  const [halftimeSecondHalf, setHalftimeSecondHalf] = useState<Record<string, boolean>>({})
  const [halftimeSlotAssignments, setHalftimeSlotAssignments] = useState<
    Record<string, string | null>
  >({})
  const [secondHalfSlotAssignments, setSecondHalfSlotAssignments] = useState<
    Record<string, string | null>
  >({})
  const [carriedFromFirstHalf, setCarriedFromFirstHalf] = useState<Record<string, boolean>>({})
  const [lineupPresets, setLineupPresets] = useState<DbLineupPreset[]>([])
  const [teamRoster, setTeamRoster] = useState<RosterPlayer[]>([])
  const [setupSlotAssignments, setSetupSlotAssignments] = useState<
    Record<string, string | null> | undefined
  >(undefined)
  const [setupPitchKey, setSetupPitchKey] = useState(0)
  const [halftimePitchKey, setHalftimePitchKey] = useState(0)

  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null)
  const [setupCoachName, setSetupCoachName] = useState('')
  const [matchTeamName, setMatchTeamName] = useState('')
  const [matchCoachName, setMatchCoachName] = useState('')
  const [matchOpponent, setMatchOpponent] = useState('')
  const [matchLocationType, setMatchLocationType] = useState<LocationType>('home')
  const [matchTournamentGame, setMatchTournamentGame] = useState(false)
  const [halfLengthMinutes, setHalfLengthMinutes] = useState(DEFAULT_HALF_LENGTH)

  const [opponent, setOpponent] = useState('')
  const [locationType, setLocationType] = useState<LocationType>('home')
  const [tournamentGame, setTournamentGame] = useState(false)
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

  const applyRoster = useCallback((roster: RosterPlayer[]) => {
    setMasterRoster(roster)
    setSetupLineup(createDefaultSetupLineup(roster.map((p) => p.id)))
    setMatchPositions(ensureMatchPositions(roster))
  }, [])

  const loadTeamRoster = useCallback(
    async (teamId: string) => {
      setRosterLoading(true)
      try {
        const playersData = await fetchPlayersByTeamId(teamId)
        applyRoster(playersData.map(dbPlayerToRoster))
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
    [applyRoster],
  )

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setLoadError(null)
      try {
        const [teamsData, coachesData] = await Promise.all([fetchTeams(), fetchCoaches()])

        if (cancelled) return

        setTeams(teamsData)
        setCoaches(coachesData)

        const active = await fetchActiveMatch()
        if (cancelled) return

        let resolvedTeamId: string | null = null

        if (active) {
          const { match, team, coach, stats } = active
          const teamPlayers = await fetchPlayersByTeamId(match.team_id)
          if (cancelled) return

          const roster = teamPlayers.map(dbPlayerToRoster)
          const matchPlayers = rebuildMatchPlayers(roster, stats)

          setSelectedTeamId(match.team_id)
          resolvedTeamId = match.team_id
          setMasterRoster(roster)
          setMatchId(match.id)
          setMatchStatus('active')
          setAppMode('home')
          setPlayers(matchPlayers)
          setHomeScore(match.home_score)
          setAwayScore(match.away_score)
          setSeconds(match.clock_seconds)
          setPeriod(match.period)
          setPeriodClockStarted(match.period_clock_started)
          setHalfLengthMinutes(match.half_length)
          setMatchTeamName(team.name)
          setMatchCoachName(resolveMatchCoachName(match, coach))
          setSetupCoachName(resolveMatchCoachName(match, coach))
          setMatchOpponent(match.opponent)
          setMatchLocationType(resolveMatchLocationType(match))
          setMatchTournamentGame(match.tournament_game)
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
          resolvedTeamId = teamsData[0].id
          setSelectedTeamId(teamsData[0].id)
        }

        if (resolvedTeamId) {
          const playersData = await fetchPlayersByTeamId(resolvedTeamId)
          if (!cancelled) {
            applyRoster(playersData.map(dbPlayerToRoster))
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

    const team = teams.find((entry) => entry.id === selectedTeamId)
    setSetupCoachName(team?.primary_coach_name?.trim() ?? '')
  }, [appMode, selectedTeamId, teams])

  useEffect(() => {
    if (appMode !== 'match_setup' || !selectedTeamId) return

    let cancelled = false

    void (async () => {
      try {
        await loadTeamRoster(selectedTeamId)
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : 'Failed to load roster')
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
    if (!selectedTeamId || (appMode !== 'match_setup' && appMode !== 'team' && appMode !== 'reporting' && appMode !== 'halftime' && appMode !== 'match')) return

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
    if (!selectedTeamId) {
      setTeamRoster([])
      return
    }
    setRosterLoading(true)
    try {
      const playersData = await fetchPlayersByTeamId(selectedTeamId, { includeInactive: true })
      setTeamRoster(playersData.map(dbPlayerToRoster))
    } finally {
      setRosterLoading(false)
    }
  }, [selectedTeamId])

  const refreshLineupPresets = useCallback(async () => {
    if (!selectedTeamId) {
      setLineupPresets([])
      return
    }
    const presets = await fetchLineupPresetsByTeamId(selectedTeamId)
    setLineupPresets(presets)
  }, [selectedTeamId])

  const applyLineupPreset = useCallback(
    (preset: DbLineupPreset) => {
      const team = teams.find((t) => t.id === selectedTeamId)
      const format = normalizeTeamFormat(team?.format)
      const applied = applyPresetToSetup(preset, masterRoster, format)
      setSetupLineup(applied.setupLineup)
      setMatchPositions(applied.matchPositions)
      setFirstHalfFormation(applied.formationId)
      setSetupSlotAssignments(applied.slotAssignments)
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
    }) => {
      if (!selectedTeamId) throw new Error('Select a team first')
      const team = teams.find((t) => t.id === selectedTeamId)
      const format = normalizeTeamFormat(team?.format)
      validatePresetFormation(input.formationId, format)
      const formationJson = { formationId: input.formationId, slotAssignments: input.slotAssignments }
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
      setMasterRoster([])
      setSetupLineup({ attending: {}, startFirstHalf: {} })
      setMatchPositions({})
      setSetupSlotAssignments(undefined)
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

  const createTeam = useCallback(async (name: string) => {
    const team = await insertTeam(name)
    setTeams((prev) => [...prev, team].sort((a, b) => a.name.localeCompare(b.name)))
    selectTeam(team.id)
    return team.id
  }, [selectTeam])

  const createCoach = useCallback(async (name: string) => {
    const coach = await insertCoach(name)
    setCoaches((prev) => [...prev, coach].sort((a, b) => a.name.localeCompare(b.name)))
    return coach
  }, [])

  const activeTeamPrimaryCoachName = useMemo(() => {
    const team = teams.find((entry) => entry.id === selectedTeamId)
    return team?.primary_coach_name?.trim() ?? ''
  }, [teams, selectedTeamId])

  const activeTeamFormat = useMemo(() => {
    const team = teams.find((t) => t.id === selectedTeamId)
    return normalizeTeamFormat(team?.format)
  }, [teams, selectedTeamId])

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
    }) => {
      if (!selectedTeamId) throw new Error('Select a team before adding players')

      const created = await upsertPlayer({
        teamId: selectedTeamId,
        firstName: input.firstName,
        lastName: input.lastName,
        jersey: input.jersey,
        isGuest: input.isGuest,
        position: input.position,
        primaryPosition: input.primaryPosition,
        secondaryPosition: input.secondaryPosition,
      })
      const rosterPlayer = dbPlayerToRoster(created)
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
    [selectedTeamId],
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
      },
    ) => {
      const existing = masterRoster.find((p) => p.id === id) ?? teamRoster.find((p) => p.id === id)
      if (!existing) throw new Error('Player not found')

      const updated = await upsertPlayer({
        id,
        teamId: existing.teamId,
        firstName: updates.firstName,
        lastName: updates.lastName,
        jersey: updates.jersey,
        isGuest: updates.isGuest,
        primaryPosition: updates.primaryPosition ?? existing.primaryPosition,
        secondaryPosition: updates.secondaryPosition ?? existing.secondaryPosition,
      })
      const rosterPlayer = dbPlayerToRoster(updated)
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
    [masterRoster, teamRoster],
  )

  const setPlayerActive = useCallback(
    async (id: string, active: boolean) => {
      const updated = await setPlayerActiveStatus(id, active)
      const rosterPlayer = dbPlayerToRoster(updated)
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
      halfLength: number
      matchDate: string
      matchTime: string
      attendingPlayers: RosterPlayer[]
      firstHalfStarterIds: string[]
      matchPositions: Record<string, string>
      firstHalfFormation: string
    }) => {
      const existing = await fetchActiveMatch()
      if (existing) {
        await completeMatch(existing.match.id)
      }

      let createdMatchId: string | null = null

      try {
        const coachId = await resolveCoachIdForName(input.coachName)
        const match = await createMatchRecord({
          teamId: input.teamId,
          coachId,
          coachName: input.coachName,
          opponent: input.opponent,
          locationType: input.locationType,
          tournamentGame: input.tournamentGame,
          halfLength: input.halfLength,
          matchDate: input.matchDate,
          matchTime: input.matchTime,
        })
        createdMatchId = match.id

        const matchPlayers = await createMatchStats(
          match.id,
          input.attendingPlayers,
          input.firstHalfStarterIds,
          input.matchPositions,
          input.firstHalfFormation,
        )

        setMatchId(match.id)
        setMatchStatus('active')
        setAppMode('match')
        setPlayers(matchPlayers)
        setHomeScore(0)
        setAwayScore(0)
        setSeconds(initialHalfClock(input.halfLength))
        setPeriod('1st')
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
        setHalfLengthMinutes(input.halfLength)

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
    [],
  )

  const enterHalftime = useCallback(
    async (clockSeconds: number, slotAssignments?: Record<string, string | null>) => {
      setRunning(false)

      let nextPlayers: MatchPlayer[] = []
      let toggles: Record<string, boolean> = {}
      let carried: Record<string, boolean> = {}

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
        carried = Object.fromEntries(
          finalized.filter((p) => p.attending && onFieldById[p.id]).map((p) => [p.id, true]),
        )

        nextPlayers = finalized.map((p) =>
          p.attending ? { ...p, isOnField: false, subbedInAt: null } : p,
        )

        if (matchId) void syncMatchStats(matchId, nextPlayers)
        return nextPlayers
      })

      if (slotAssignments) setHalftimeSlotAssignments(slotAssignments)
      setCarriedFromFirstHalf(carried)
      setHalftimeSecondHalf(toggles)
      setHalftimePitchKey(0)
      setMatchFormations((prev) => ({ ...prev, second: prev.first }))
      setAppMode('halftime')
      return nextPlayers
    },
    [matchId, halfLengthMinutes, setRunning, getActiveFormation],
  )

  const setHalftimeStarter = useCallback((id: string, starts: boolean) => {
    setHalftimeSecondHalf((prev) => ({ ...prev, [id]: starts }))
  }, [])

  const beginSecondHalf = useCallback(
    async (slotAssignments?: Record<string, string | null>) => {
      const newClock = initialHalfClock(halfLengthMinutes)
      const formation = matchFormationsRef.current.second

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
          linedUp = applySlotAssignmentPositions(linedUp, slotAssignments, formation)
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
              eventNotes: starter?.matchPosition,
            })
          }
          void syncMatchStats(matchId, stamped)
        }

        return stamped
      })

      setSecondHalfStarterIds([...starterIds])
      setPeriod('2nd')
      setSeconds(newClock)
      setRunning(true)
      setPeriodClockStarted(true)
      setAppMode('match')
    },
    [halftimeSecondHalf, halfLengthMinutes, matchId, setPeriod, setSeconds, setRunning, setPeriodClockStarted],
  )

  const finishGame = useCallback(
    async (clockSeconds: number) => {
      setRunning(false)

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
              })
            }
          }
        }

        const finalized = finalizeAllOnField(prev, clockSeconds).map((p) =>
          p.attending && p.isOnField ? { ...p, isOnField: false, subbedInAt: null } : p,
        )

        if (matchId) {
          void syncMatchStats(matchId, finalized)
          void markMatchPendingReview(matchId)
        }

        return finalized
      })

      setMatchStatus('pending_review')
      setAppMode('recap')
    },
    [matchId, halfLengthMinutes, setRunning, getActiveFormation],
  )

  const returnToHome = useCallback(() => {
    setAppMode('home')
    setPlayers([])
    setHomeScore(0)
    setAwayScore(0)
    setSeconds(0)
    setPeriod('1st')
    setRunning(false)
    setPeriodClockStarted(false)
    setFirstHalfStarterIds([])
    setSecondHalfStarterIds([])
    setHalftimeSecondHalf({})
    setHalftimeSlotAssignments({})
    setSecondHalfSlotAssignments({})
    setCarriedFromFirstHalf({})
    setSetupSlotAssignments(undefined)
    setSetupPitchKey((k) => k + 1)
    setHalftimePitchKey(0)
    setMatchTeamName('')
    setMatchCoachName('')
    setSetupCoachName('')
    setMatchOpponent('')
    setMatchLocationType('home')
    setMatchTournamentGame(false)
    setLocationType('home')
    setMatchFormations({
      first: getDefaultFormationId(activeTeamFormat),
      second: getDefaultFormationId(activeTeamFormat),
    })
    setMatchDate(defaultMatchDate())
    setMatchTime(defaultMatchTime())
    setMatchId(null)
    setMatchStatus(null)
  }, [activeTeamFormat])

  const openPendingReviewRecap = useCallback(async (targetMatchId: string) => {
    const bundle = await fetchMatchRecapBundle(targetMatchId)
    if (!bundle) throw new Error('Match not found')

    const { match, team, coach, stats } = bundle
    const teamPlayers = await fetchPlayersByTeamId(match.team_id)
    const roster = teamPlayers.map(dbPlayerToRoster)
    const matchPlayers = rebuildMatchPlayers(roster, stats)

    setSelectedTeamId(match.team_id)
    setMasterRoster(roster)
    setMatchId(match.id)
    setMatchStatus('pending_review')
    setPlayers(matchPlayers)
    setHomeScore(match.home_score)
    setAwayScore(match.away_score)
    setSeconds(match.clock_seconds)
    setPeriod(match.period)
    setPeriodClockStarted(match.period_clock_started)
    setHalfLengthMinutes(match.half_length)
    setMatchTeamName(team.name)
    setMatchCoachName(resolveMatchCoachName(match, coach))
    setMatchOpponent(match.opponent)
    setMatchLocationType(resolveMatchLocationType(match))
    setMatchTournamentGame(match.tournament_game)
    setFirstHalfStarterIds(stats.filter((s) => s.is_first_half_starter).map((s) => s.player_id))
    setSecondHalfStarterIds(stats.filter((s) => s.is_second_half_starter).map((s) => s.player_id))
    setAppMode('recap')
  }, [])

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
    setPeriod,
    running,
    setRunning,
    periodClockStarted,
    setPeriodClockStarted,
    firstHalfStarterIds,
    secondHalfStarterIds,
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
    openPendingReviewRecap,
    matchStatus,
    hasLiveMatch: matchStatus === 'active' && Boolean(matchId),
    hasPendingRecap: matchStatus === 'pending_review' && Boolean(matchId),
    selectedTeamId,
    activeTeamId: selectedTeamId,
    activeTeamFormat,
    selectTeam,
    setActiveTeamId,
    updateTeamFormat,
    updateTeamPrimaryCoach,
    activeTeamPrimaryCoachName,
    setupCoachName,
    setSetupCoachName,
    matchTeamName,
    matchCoachName,
    matchOpponent,
    matchLocationType,
    matchTournamentGame,
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
    getActiveFormation,
    setPlayerAttending,
    setStartFirstHalf,
    createTeam,
    createCoach,
    addPlayer,
    updatePlayer,
    beginMatch,
    endMatch,
    setSetupMatchPosition,
  }
}
