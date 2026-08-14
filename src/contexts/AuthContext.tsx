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
import {
  type StaffRole,
  canDeleteMatches,
  canUseSprocketIntegration,
  isStaffRole,
} from '@/lib/staff-roles'

type AuthContextValue = {
  session: Session | null
  user: User | null
  role: StaffRole | null
  loading: boolean
  isAuthenticated: boolean
  canDeleteMatches: boolean
  canUseSprocketIntegration: boolean
  signIn: (email: string, password: string) => Promise<void>
  signUp: (email: string, password: string, displayName?: string) => Promise<void>
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
    setRole(await fetchUserRole(userId))
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
      setRole(nextUser ? await fetchUserRole(nextUser.id) : null)
      if (!cancelled) setLoading(false)
    })()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      void (async () => {
        setSession(nextSession)
        const nextUser = nextSession?.user ?? null
        setUser(nextUser)
        setRole(nextUser ? await fetchUserRole(nextUser.id) : null)
        setLoading(false)
      })()
    })

    return () => {
      cancelled = true
      subscription.unsubscribe()
    }
  }, [])

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })
    if (error) throw error
  }, [])

  const signUp = useCallback(async (email: string, password: string, displayName?: string) => {
    const trimmedName = displayName?.trim() || undefined
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: trimmedName
        ? {
            data: { display_name: trimmedName },
          }
        : undefined,
    })
    if (error) throw error

    // Role row is created by DB trigger; refresh if session is already active.
    if (data.user && data.session) {
      if (trimmedName) {
        await supabase
          .from('user_roles')
          .update({ display_name: trimmedName })
          .eq('user_id', data.user.id)
      }
      setRole(await fetchUserRole(data.user.id))
    }
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
      canDeleteMatches: canDeleteMatches(role),
      canUseSprocketIntegration: canUseSprocketIntegration(role),
      signIn,
      signUp,
      signOut,
      refreshRole,
    }),
    [session, user, role, loading, signIn, signUp, signOut, refreshRole],
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
