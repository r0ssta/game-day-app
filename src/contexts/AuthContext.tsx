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
  type StaffRole,
  canAccessClubAdmin,
  canDeleteMatches,
  canUseSprocketIntegration,
  isActiveStaffRole,
  isStaffRole,
} from '@/lib/staff-roles'

type AuthContextValue = {
  session: Session | null
  user: User | null
  role: StaffRole | null
  loading: boolean
  isAuthenticated: boolean
  isActiveStaff: boolean
  canDeleteMatches: boolean
  canUseSprocketIntegration: boolean
  canAccessClubAdmin: boolean
  signInWithMagicLink: (email: string) => Promise<void>
  signOut: () => Promise<void>
  refreshRole: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

async function fetchUserRole(userId: string): Promise<StaffRole | null> {
  const { data, error } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) {
    console.warn('[auth] failed to load user role', error.message)
    return null
  }

  return isStaffRole(data?.role) ? data.role : null
}

async function resolveStaffRole(userId: string): Promise<StaffRole | null> {
  let role = await fetchUserRole(userId)

  // First club user (or pre-bootstrap pending user) can claim Director.
  if (!isActiveStaffRole(role)) {
    const { data, error } = await supabase.rpc('claim_bootstrap_director')
    if (error) {
      console.warn('[auth] bootstrap director claim skipped', error.message)
    } else if (isStaffRole(data)) {
      role = data
    } else {
      role = await fetchUserRole(userId)
    }
  }

  return role
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [role, setRole] = useState<StaffRole | null>(null)
  const [loading, setLoading] = useState(true)

  const refreshRole = useCallback(async () => {
    const userId = (await supabase.auth.getUser()).data.user?.id
    if (!userId) {
      setRole(null)
      return
    }
    setRole(await resolveStaffRole(userId))
  }, [])

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
      setRole(nextUser ? await resolveStaffRole(nextUser.id) : null)
      if (!cancelled) setLoading(false)
    })()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      void (async () => {
        setSession(nextSession)
        const nextUser = nextSession?.user ?? null
        setUser(nextUser)
        setRole(nextUser ? await resolveStaffRole(nextUser.id) : null)
        setLoading(false)
      })()
    })

    return () => {
      cancelled = true
      subscription.unsubscribe()
    }
  }, [])

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
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user,
      role,
      loading,
      isAuthenticated: Boolean(session?.user),
      isActiveStaff: isActiveStaffRole(role),
      canDeleteMatches: canDeleteMatches(role),
      canUseSprocketIntegration: canUseSprocketIntegration(role),
      canAccessClubAdmin: canAccessClubAdmin(role),
      signInWithMagicLink,
      signOut,
      refreshRole,
    }),
    [session, user, role, loading, signInWithMagicLink, signOut, refreshRole],
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
