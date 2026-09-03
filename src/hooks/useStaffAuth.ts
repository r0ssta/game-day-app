import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import {
  fetchTeamCoachingStaff,
  updateTeamPrimaryCoachName as updateTeamPrimaryCoachNameApi,
  type TeamCoachingStaff,
} from '@/lib/supabase-api'
import type { DbCoach, DbTeam } from '@/types/database'
import type { AppMode } from '@/types/match'

export type UseStaffAuthOptions = {
  selectedTeamId: string | null
  teams: DbTeam[]
  appMode: AppMode
  setTeams: Dispatch<SetStateAction<DbTeam[]>>
}

export function useStaffAuth({
  selectedTeamId,
  teams,
  appMode,
  setTeams,
}: UseStaffAuthOptions) {
  const [coaches, setCoaches] = useState<DbCoach[]>([])
  const [setupCoachName, setSetupCoachName] = useState('')
  const [teamCoachingStaff, setTeamCoachingStaff] = useState<TeamCoachingStaff>({
    headCoaches: [],
    assistants: [],
  })
  const [clubStaffCoachNames, setClubStaffCoachNames] = useState<string[]>([])

  const setupCoachPrefillRef = useRef<{ appMode: AppMode; teamId: string | null }>({
    appMode: 'home',
    teamId: null,
  })

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

  const activeTeamPrimaryCoachName = useMemo(() => {
    const team = teams.find((entry) => entry.id === selectedTeamId)
    return team?.primary_coach_name?.trim() ?? ''
  }, [teams, selectedTeamId])

  const updateTeamPrimaryCoach = useCallback(
    async (primaryCoachName: string) => {
      if (!selectedTeamId) throw new Error('Select a team first')
      const updated = await updateTeamPrimaryCoachNameApi(selectedTeamId, primaryCoachName)
      setTeams((prev) => prev.map((team) => (team.id === updated.id ? updated : team)))
      return updated
    },
    [selectedTeamId, setTeams],
  )

  return {
    coaches,
    setCoaches,
    setupCoachName,
    setSetupCoachName,
    teamCoachingStaff,
    setTeamCoachingStaff,
    clubStaffCoachNames,
    setClubStaffCoachNames,
    activeTeamPrimaryCoachName,
    updateTeamPrimaryCoach,
  }
}
