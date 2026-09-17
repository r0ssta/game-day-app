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
import { ensureFreshSession, sessionNeedsRefresh } from '@/lib/auth-session'
import {
  type AppRole,
  type TeamRole,
  canAccessClubAdmin,
  canAccessPlatformAdmin,
  canAccessSystemAdmin,
  canDeleteMatches,
  canUseSprocketIntegration,
  isActiveAppRole,
  isActiveStaffUser,
  isAppRole,
  isTeamRole,
} from '@/lib/staff-roles'
import { persistActiveClubId, readPersistedActiveClubId } from '@/lib/team-context'
import { logSystemActivity } from '@/lib/audit-log'

export type TeamMembership = {
  teamId: string
  teamRole: TeamRole
}

export type ClubMembership = {
  clubId: string
  clubName: string
  clubSlug: string
  appRole: AppRole
}

type AuthContextValue = {
  session: Session | null
  user: User | null
  /** App-level role for the current club (director | coach | pending). */
  role: AppRole | null
  appRole: AppRole | null
  currentClubId: string | null
  currentClubName: string | null
  clubMemberships: ClubMembership[]
  isPlatformAdmin: boolean
  isSystemAdmin: boolean
  teamMemberships: TeamMembership[]
  /** True while reading the persisted auth session (blocks the login gate). */
  loading: boolean
  /** True while roles / team memberships load after sign-in. */
  accessLoading: boolean
  isAuthenticated: boolean
  isActiveStaff: boolean
  canAccessClubAdmin: boolean
  canAccessPlatformAdmin: boolean
  canAccessSystemAdmin: boolean
  setCurrentClubId: (clubId: string) => void
  getTeamRole: (teamId: string | null | undefined) => TeamRole | null
  canDeleteMatchesForTeam: (teamId: string | null | undefined) => boolean
  canUseSprocketForTeam: (teamId: string | null | undefined) => boolean
  /** Send an email OTP (PWA-friendly; no magic-link redirect). */
  sendLoginOtp: (email: string) => Promise<void>
  /** Verify the email OTP and establish a session. */
  verifyLoginOtp: (email: string, token: string) => Promise<void>
  signOut: () => Promise<void>
  refreshRole: () => Promise<void>
  /** Foreground session refresh: ok, in flight, or refresh failed. */
  authHealth: 'ok' | 'reconnecting' | 'failed'
}

const AuthContext = createContext<AuthContextValue | null>(null)

/** Never leave coaches stuck on the splash — unblock after this many ms. */
const SESSION_BOOTSTRAP_TIMEOUT_MS = 4_000

async function fetchClubMemberships(userId: string): Promise<ClubMembership[]> {
  const { data, error } = await supabase
    .from('club_memberships')
    .select('club_id, app_role, clubs(name, slug)')
    .eq('user_id', userId)

  if (error) {
    console.warn('[auth] failed to load club memberships', error.message)
    return []
  }

  return (data ?? []).flatMap((row) => {
    if (!isAppRole(row.app_role)) return []
    const club = Array.isArray(row.clubs) ? row.clubs[0] : row.clubs
    return [
      {
        clubId: row.club_id,
        clubName: club?.name?.trim() || 'Club',
        clubSlug: club?.slug?.trim() || row.club_id,
        appRole: row.app_role,
      },
    ]
  })
}

async function fetchIsPlatformAdmin(userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('platform_admins')
    .select('user_id')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) {
    console.warn('[auth] failed to load platform admin', error.message)
    return false
  }

  return Boolean(data?.user_id)
}

async function fetchIsSystemAdmin(userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('system_admins')
    .select('user_id')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) {
    console.warn('[auth] failed to load system admin', error.message)
    return false
  }

  return Boolean(data?.user_id)
}

function resolveCurrentClubId(memberships: ClubMembership[]): string | null {
  if (memberships.length === 0) return null
  const persisted = readPersistedActiveClubId()
  if (persisted && memberships.some((row) => row.clubId === persisted)) {
    return persisted
  }
  const velocity = memberships.find((row) => row.clubSlug === 'virginia-velocity')
  return velocity?.clubId ?? memberships[0]?.clubId ?? null
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

async function maybeClaimBootstrap(): Promise<void> {
  const { error } = await supabase.rpc('claim_bootstrap_director')
  if (error) {
    console.warn('[auth] bootstrap director claim skipped', error.message)
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [role, setRole] = useState<AppRole | null>(null)
  const [currentClubId, setCurrentClubIdState] = useState<string | null>(null)
  const [clubMemberships, setClubMemberships] = useState<ClubMembership[]>([])
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false)
  const [isSystemAdmin, setIsSystemAdmin] = useState(false)
  const [teamMemberships, setTeamMemberships] = useState<TeamMembership[]>([])
  const [sessionLoading, setSessionLoading] = useState(true)
  const [accessLoading, setAccessLoading] = useState(false)
  const [authHealth, setAuthHealth] = useState<'ok' | 'reconnecting' | 'failed'>('ok')

  const applyMemberships = useCallback((memberships: ClubMembership[], preferredClubId?: string | null) => {
    setClubMemberships(memberships)
    const nextClubId =
      preferredClubId && memberships.some((row) => row.clubId === preferredClubId)
        ? preferredClubId
        : resolveCurrentClubId(memberships)
    setCurrentClubIdState(nextClubId)
    persistActiveClubId(nextClubId)
    const membership = memberships.find((row) => row.clubId === nextClubId)
    setRole(membership?.appRole ?? (memberships.length === 0 ? 'pending' : null))
  }, [])

  const loadAccess = useCallback(async (userId: string | undefined | null) => {
    if (!userId) {
      setRole(null)
      setCurrentClubIdState(null)
      setClubMemberships([])
      setIsPlatformAdmin(false)
      setIsSystemAdmin(false)
      setTeamMemberships([])
      return
    }

    let [memberships, platformAdmin, systemAdmin, nextMemberships] = await Promise.all([
      fetchClubMemberships(userId),
      fetchIsPlatformAdmin(userId),
      fetchIsSystemAdmin(userId),
      fetchTeamMemberships(userId),
    ])

    const hasActiveClub = memberships.some((row) => isActiveAppRole(row.appRole))
    if (!hasActiveClub && !platformAdmin) {
      await maybeClaimBootstrap()
      ;[memberships, platformAdmin, systemAdmin, nextMemberships] = await Promise.all([
        fetchClubMemberships(userId),
        fetchIsPlatformAdmin(userId),
        fetchIsSystemAdmin(userId),
        fetchTeamMemberships(userId),
      ])
    }

    setIsPlatformAdmin(platformAdmin)
    setIsSystemAdmin(systemAdmin)
    setTeamMemberships(nextMemberships)
    applyMemberships(memberships)
  }, [applyMemberships])

  const refreshRole = useCallback(async () => {
    const userId = (await supabase.auth.getUser()).data.user?.id
    setAccessLoading(true)
    try {
      await loadAccess(userId)
    } finally {
      setAccessLoading(false)
    }
  }, [loadAccess])

  // Session bootstrap: sync callback only (never postgREST/RPC here — supabase/auth-js#762).
  useEffect(() => {
    let cancelled = false
    let finished = false

    const finishSessionBootstrap = () => {
      if (cancelled || finished) return
      finished = true
      setSessionLoading(false)
    }

    const timeoutId = window.setTimeout(() => {
      console.warn('[auth] session bootstrap timed out — continuing without blocking')
      finishSessionBootstrap()
    }, SESSION_BOOTSTRAP_TIMEOUT_MS)

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession)
      setUser(nextSession?.user ?? null)
      if (event === 'SIGNED_OUT') {
        setAuthHealth('ok')
      } else if (event === 'TOKEN_REFRESHED' || event === 'SIGNED_IN') {
        setAuthHealth('ok')
      }
      finishSessionBootstrap()
    })

    return () => {
      cancelled = true
      window.clearTimeout(timeoutId)
      subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (sessionLoading) return

    const refreshOnForeground = () => {
      if (document.visibilityState !== 'visible') return
      if (!session) return
      if (!sessionNeedsRefresh(session.expires_at)) {
        setAuthHealth('ok')
        return
      }
      setAuthHealth('reconnecting')
      void ensureFreshSession().then((result) => {
        setAuthHealth(result.ok ? 'ok' : 'failed')
      })
    }

    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) refreshOnForeground()
    }

    document.addEventListener('visibilitychange', refreshOnForeground)
    window.addEventListener('pageshow', onPageShow)
    return () => {
      document.removeEventListener('visibilitychange', refreshOnForeground)
      window.removeEventListener('pageshow', onPageShow)
    }
  }, [sessionLoading, session])

  useEffect(() => {
    if (sessionLoading) return

    let cancelled = false
    void (async () => {
      setAccessLoading(true)
      try {
        await loadAccess(user?.id ?? null)
      } catch (err) {
        console.warn('[auth] failed to load access', err)
      } finally {
        if (!cancelled) setAccessLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [sessionLoading, user?.id, loadAccess])

  const sendLoginOtp = useCallback(async (email: string) => {
    const trimmed = email.trim()
    if (!trimmed) throw new Error('Email is required')

    const { error } = await supabase.auth.signInWithOtp({
      email: trimmed,
      options: {
        shouldCreateUser: true,
      },
    })
    if (error) throw error
  }, [])

  const verifyLoginOtp = useCallback(async (email: string, token: string) => {
    const trimmedEmail = email.trim()
    const trimmedToken = token.trim()
    if (!trimmedEmail) throw new Error('Email is required')
    // GoTrue OTP length is project-configurable (typically 6–8, max 10).
    if (!/^\d{6,10}$/.test(trimmedToken)) {
      throw new Error('Enter the login code from your email')
    }

    const { error } = await supabase.auth.verifyOtp({
      email: trimmedEmail,
      token: trimmedToken,
      type: 'email',
    })
    if (error) {
      const message = error.message.toLowerCase()
      if (message.includes('expired') || message.includes('invalid')) {
        throw new Error('That code is invalid or expired. Request a new code and try again.')
      }
      throw error
    }

    void logSystemActivity({ actionType: 'login', metadata: { email: trimmedEmail } })
  }, [])

  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut()
    if (error) throw error
    setRole(null)
    setCurrentClubIdState(null)
    setClubMemberships([])
    setIsPlatformAdmin(false)
    setIsSystemAdmin(false)
    setTeamMemberships([])
  }, [])

  const setCurrentClubId = useCallback(
    (clubId: string) => {
      applyMemberships(clubMemberships, clubId)
    },
    [applyMemberships, clubMemberships],
  )

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

  const currentClubName =
    clubMemberships.find((row) => row.clubId === currentClubId)?.clubName ?? null

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user,
      role,
      appRole: role,
      currentClubId,
      currentClubName,
      clubMemberships,
      isPlatformAdmin,
      isSystemAdmin,
      teamMemberships,
      loading: sessionLoading,
      accessLoading,
      isAuthenticated: Boolean(session?.user),
      isActiveStaff: isActiveStaffUser(role, isPlatformAdmin),
      canAccessClubAdmin: canAccessClubAdmin(role),
      canAccessPlatformAdmin: canAccessPlatformAdmin(isPlatformAdmin),
      canAccessSystemAdmin: canAccessSystemAdmin(isSystemAdmin),
      setCurrentClubId,
      getTeamRole,
      canDeleteMatchesForTeam,
      canUseSprocketForTeam,
      sendLoginOtp,
      verifyLoginOtp,
      signOut,
      refreshRole,
      authHealth,
    }),
    [
      session,
      user,
      role,
      currentClubId,
      currentClubName,
      clubMemberships,
      isPlatformAdmin,
      isSystemAdmin,
      teamMemberships,
      sessionLoading,
      accessLoading,
      setCurrentClubId,
      getTeamRole,
      canDeleteMatchesForTeam,
      canUseSprocketForTeam,
      sendLoginOtp,
      verifyLoginOtp,
      signOut,
      refreshRole,
      authHealth,
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
