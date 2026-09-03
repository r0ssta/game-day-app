import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { AgeGroup } from '@/lib/age-groups'
import {
  defaultTeamNameForAgeGroup,
  formatForAgeGroup,
  formatTeamDisplayName,
  normalizeAgeGroup,
  stripAgeGroupFromTeamName,
} from '@/lib/age-groups'
import { getDefaultFormationId } from '@/lib/formations'
import { normalizeMatchTimeForInput } from '@/lib/match-schedule'
import type { LocationType } from '@/lib/match-location'
import {
  poolPlayerToGuestRoster,
  resolveTeamAgeGroup,
  seasonRosterToPlayers,
} from '@/lib/season-roster'
import {
  archiveSeason,
  assignPlayerToSeasonRoster,
  createSeason,
  createScheduledMatchRecord,
  dbPlayerToRoster,
  deleteLineupPreset,
  deleteMatchRecord,
  fetchAgeGroupPoolPlayers,
  fetchLineupPresetsByTeamId,
  fetchPlayersByIds,
  fetchScheduledMatchesByTeamId,
  fetchSeasonRosterPlayers,
  insertLineupPreset,
  insertTeam,
  removePlayerFromSeasonRoster,
  resolveCoachIdForName,
  setActiveSeason,
  setPlayerActiveStatus,
  setTeamActiveStatus,
  updateLineupPreset,
  updateSeason,
  updateTeamAgeGroup as updateTeamAgeGroupApi,
  updateTeamFormat as updateTeamFormatApi,
  updateTeamProfile as updateTeamProfileApi,
  upsertPlayer,
} from '@/lib/supabase-api'
import {
  persistActiveTeamId,
  resolveTeamScope,
  type TeamScope,
} from '@/lib/team-context'
import { normalizeTeamFormat, type TeamFormat } from '@/lib/team-format'
import { buildFormationJson, validatePresetFormation } from '@/lib/lineup-presets'
import type { DbLineupPreset, DbMatch, DbSeason, DbTeam } from '@/types/database'
import type { AppMode, RosterPlayer } from '@/types/match'

export type UseRosterOptions = {
  appMode: AppMode
  /** Called after master roster is replaced so match setup can reset lineup/positions. */
  onApplyRoster?: (roster: RosterPlayer[]) => void
  /** Team format/age changes that must reset match formations and setup slots. */
  onTeamShapeChange?: (format: TeamFormat) => void
}

export function useRoster({
  appMode,
  onApplyRoster,
  onTeamShapeChange,
}: UseRosterOptions) {
  const [rosterLoading, setRosterLoading] = useState(false)
  const [teams, setTeams] = useState<DbTeam[]>([])
  const [seasons, setSeasons] = useState<DbSeason[]>([])
  const [activeSeason, setActiveSeasonState] = useState<DbSeason | null>(null)
  const [masterRoster, setMasterRoster] = useState<RosterPlayer[]>([])
  const [teamRoster, setTeamRoster] = useState<RosterPlayer[]>([])
  const [lineupPresets, setLineupPresets] = useState<DbLineupPreset[]>([])
  const [scheduledMatches, setScheduledMatches] = useState<DbMatch[]>([])
  const [scheduledLoading, setScheduledLoading] = useState(false)
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null)

  // Keep parent callbacks off hook identities — match setup's load effect
  // depends on loadTeamRoster and must not re-run on every parent render.
  const onApplyRosterRef = useRef(onApplyRoster)
  onApplyRosterRef.current = onApplyRoster
  const onTeamShapeChangeRef = useRef(onTeamShapeChange)
  onTeamShapeChangeRef.current = onTeamShapeChange

  const applyRoster = useCallback((roster: RosterPlayer[]) => {
    setMasterRoster(roster)
    onApplyRosterRef.current?.(roster)
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
    if (
      !selectedTeamId ||
      (appMode !== 'match_setup' &&
        appMode !== 'team' &&
        appMode !== 'reporting' &&
        appMode !== 'recap_history' &&
        appMode !== 'halftime' &&
        appMode !== 'match')
    )
      return

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

  const persistSelectedTeamId = useCallback((teamId: string | null) => {
    setSelectedTeamId(teamId)
    if (teamId) persistActiveTeamId(teamId)
  }, [])

  const createTeamRecord = useCallback(async (input: { name?: string; ageGroup: AgeGroup }) => {
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
    return team
  }, [])

  const activeTeamAgeGroup = useMemo(() => {
    const team = teams.find((entry) => entry.id === selectedTeamId)
    return normalizeAgeGroup(team?.age_group)
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

  const updateTeamAgeGroup = useCallback(
    async (ageGroup: AgeGroup) => {
      if (!selectedTeamId) throw new Error('Select a team first')
      const updated = await updateTeamAgeGroupApi(selectedTeamId, ageGroup)
      setTeams((prev) => prev.map((team) => (team.id === updated.id ? updated : team)))
      onTeamShapeChangeRef.current?.(formatForAgeGroup(ageGroup))
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
        onTeamShapeChangeRef.current?.(formatForAgeGroup(input.ageGroup))
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

  const updateTeamFormat = useCallback(
    async (format: TeamFormat) => {
      if (!selectedTeamId) throw new Error('Select a team first')
      const updated = await updateTeamFormatApi(selectedTeamId, format)
      setTeams((prev) => prev.map((team) => (team.id === updated.id ? updated : team)))
      onTeamShapeChangeRef.current?.(format)
    },
    [selectedTeamId],
  )

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
      return rosterPlayer
    },
    [selectedTeamId, activeSeason, teams],
  )

  const addGuestFromPool = useCallback(
    async (playerId: string) => {
      if (!selectedTeamId) throw new Error('Select a team first')
      const existing = masterRoster.find((p) => p.id === playerId)
      if (existing) return existing
      const [player] = await fetchPlayersByIds([playerId])
      if (!player) throw new Error('Player not found in pool')
      const rosterPlayer = poolPlayerToGuestRoster(player, selectedTeamId)
      setMasterRoster((prev) =>
        [...prev, rosterPlayer].sort((a, b) => (a.number ?? 999) - (b.number ?? 999)),
      )
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

  const setPlayerActiveOnRoster = useCallback(
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
      }
      return { rosterPlayer, active }
    },
    [selectedTeamId],
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

  return {
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
    setTeamRoster,
    lineupPresets,
    setLineupPresets,
    scheduledMatches,
    setScheduledMatches,
    scheduledLoading,
    selectedTeamId,
    setSelectedTeamId,
    persistSelectedTeamId,
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
    updateTeamFormat,
    addPlayer,
    addGuestFromPool,
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
    defaultFormationForActiveTeam: getDefaultFormationId(activeTeamFormat),
  }
}
