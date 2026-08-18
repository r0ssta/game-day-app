import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '@/supabaseClient'
import { getAuthRedirectUrl } from '@/lib/auth-redirect'
import {
  type AppRole,
  type TeamRole,
  canAccessClubAdmin,
  canDeleteMatches,
  canUseSprocketIntegration,
  isActiveAppRole,
  isAppRole,
  isTeamRole,
} from '@/lib/staff-roles'

export type TeamMembership = {
  teamId: string
  teamRole: TeamRole
}

type AuthContextValue = {
  session: Session | null
  user: User | null
  /** App-level role (director | coach | pending). */
  role: AppRole | null
  appRole: AppRole | null
  teamMemberships: TeamMembership[]
  loading: boolean
  isAuthenticated: boolean
  isActiveStaff: boolean
  canAccessClubAdmin: boolean
  getTeamRole: (teamId: string | null | undefined) => TeamRole | null
  canDeleteMatchesForTeam: (teamId: string | null | undefined) => boolean
  canUseSprocketForTeam: (teamId: string | null | undefined) => boolean
  /** @deprecated Prefer canDeleteMatchesForTeam(activeTeamId) */
  canDeleteMatches: boolean
  /** @deprecated Prefer canUseSprocketForTeam(activeTeamId) */
  canUseSprocketIntegration: boolean
  signInWithMagicLink: (email: string) => Promise<void>
  signOut: () => Promise<void>
  refreshRole: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

async function fetchUserAppRole(userId: string): Promise<AppRole | null> {
  const { data, error } = await supabase
    .from('user_roles')
    .select('app_role')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) {
    console.warn('[auth] failed to load app role', error.message)
    return null
  }

  return isAppRole(data?.app_role) ? data.app_role : null
}

async function fetchTeamMemberships(userId: string): Promise<TeamMembership[]> {
  const { data, error } = await supabase
    .from('team_members')
    .select('team_id, team_role')
    .eq('user_id', userId)

  if (error) {
    console.warn('[auth] failed to load team memberships', error.message)
    return []
  }

  return (data ?? []).flatMap((row) => {
    if (!isTeamRole(row.team_role)) return []
    return [{ teamId: row.team_id, teamRole: row.team_role }]
  })
}

async function resolveAppRole(userId: string): Promise<AppRole | null> {
  let role = await fetchUserAppRole(userId)

  if (!isActiveAppRole(role)) {
    const { data, error } = await supabase.rpc('claim_bootstrap_director')
    if (error) {
      console.warn('[auth] bootstrap director claim skipped', error.message)
    } else if (isAppRole(data)) {
      role = data
    } else {
      role = await fetchUserAppRole(userId)
    }
  }

  return role
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [role, setRole] = useState<AppRole | null>(null)
  const [teamMemberships, setTeamMemberships] = useState<TeamMembership[]>([])
  const [loading, setLoading] = useState(true)

  const loadAccess = useCallback(async (userId: string | undefined | null) => {
    if (!userId) {
      setRole(null)
      setTeamMemberships([])
      return
    }
    const [nextRole, nextMemberships] = await Promise.all([
      resolveAppRole(userId),
      fetchTeamMemberships(userId),
    ])
    setRole(nextRole)
    setTeamMemberships(nextMemberships)
  }, [])

  const refreshRole = useCallback(async () => {
    const userId = (await supabase.auth.getUser()).data.user?.id
    await loadAccess(userId)
  }, [loadAccess])

  useEffect(() => {
    let cancelled = false

    void (async () => {
      setLoading(true)
      const { data } = await supabase.auth.getSession()
      if (cancelled) return

      const nextSession = data.session ?? null
      const nextUser = nextSession?.user ?? null
      setSession(nextSession)
      setUser(nextUser)
      await loadAccess(nextUser?.id)
      if (!cancelled) setLoading(false)
    })()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      void (async () => {
        setSession(nextSession)
        const nextUser = nextSession?.user ?? null
        setUser(nextUser)
        await loadAccess(nextUser?.id)
        setLoading(false)
      })()
    })

    return () => {
      cancelled = true
      subscription.unsubscribe()
    }
  }, [loadAccess])

  const signInWithMagicLink = useCallback(async (email: string) => {
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        shouldCreateUser: true,
        emailRedirectTo: getAuthRedirectUrl(),
      },
    })
    if (error) throw error
  }, [])

  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut()
    if (error) throw error
    setRole(null)
    setTeamMemberships([])
  }, [])

  const getTeamRole = useCallback(
    (teamId: string | null | undefined): TeamRole | null => {
      if (!teamId) return null
      return teamMemberships.find((m) => m.teamId === teamId)?.teamRole ?? null
    },
    [teamMemberships],
  )

  const canDeleteMatchesForTeam = useCallback(
    (teamId: string | null | undefined) => canDeleteMatches(role, getTeamRole(teamId)),
    [role, getTeamRole],
  )

  const canUseSprocketForTeam = useCallback(
    (teamId: string | null | undefined) =>
      canUseSprocketIntegration(role, getTeamRole(teamId)),
    [role, getTeamRole],
  )

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user,
      role,
      appRole: role,
      teamMemberships,
      loading,
      isAuthenticated: Boolean(session?.user),
      isActiveStaff: isActiveAppRole(role),
      canAccessClubAdmin: canAccessClubAdmin(role),
      getTeamRole,
      canDeleteMatchesForTeam,
      canUseSprocketForTeam,
      // Legacy globals: directors only until caller passes a team id.
      canDeleteMatches: canDeleteMatches(role, null),
      canUseSprocketIntegration: canUseSprocketIntegration(role, null),
      signInWithMagicLink,
      signOut,
      refreshRole,
    }),
    [
      session,
      user,
      role,
      teamMemberships,
      loading,
      getTeamRole,
      canDeleteMatchesForTeam,
      canUseSprocketForTeam,
      signInWithMagicLink,
      signOut,
      refreshRole,
    ],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return context
}
