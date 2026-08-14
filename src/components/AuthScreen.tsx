import { useState, type FormEvent } from 'react'
import { LockKeyhole, SunMedium, UserPlus } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useSunlightMode } from '@/contexts/SunlightModeContext'
import { APP_CONTAINER, APP_SHELL } from '@/lib/layout'
import { cn } from '@/lib/utils'

type AuthMode = 'sign_in' | 'sign_up'

export function AuthScreen() {
  const { signIn, signUp } = useAuth()
  const { sunlightMode, toggleSunlightMode } = useSunlightMode()
  const [mode, setMode] = useState<AuthMode>('sign_in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    setInfo(null)
    try {
      if (mode === 'sign_in') {
        await signIn(email, password)
      } else {
        await signUp(email, password, displayName)
        setInfo(
          'Account created. If email confirmation is enabled in Supabase, check your inbox before signing in.',
        )
        setMode('sign_in')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className={`${APP_SHELL} flex min-h-dvh items-center justify-center px-4 py-10`}>
      <div className={`${APP_CONTAINER} w-full max-w-md`}>
        <div className="mb-6 flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-athletic">Game Day App</p>
            <h1 className="mt-2 font-display text-4xl font-black uppercase tracking-wide text-foreground">
              Staff Login
            </h1>
            <p className="mt-2 text-sm font-semibold text-muted-foreground">
              Sign in to manage teams, matches, and recaps.
            </p>
          </div>
          <button
            type="button"
            onClick={toggleSunlightMode}
            aria-pressed={sunlightMode}
            aria-label={sunlightMode ? 'Disable sunlight mode' : 'Enable sunlight mode'}
            className={cn(
              'flex size-11 shrink-0 touch-manipulation items-center justify-center rounded-xl border-2 shadow-sm',
              sunlightMode
                ? 'border-foreground bg-card text-foreground'
                : 'border-border bg-secondary text-muted-foreground',
            )}
          >
            <SunMedium className="size-5" strokeWidth={2.5} />
          </button>
        </div>

        <form
          onSubmit={(event) => void onSubmit(event)}
          className="auth-panel space-y-4 rounded-2xl border-2 border-border bg-card p-5 shadow-lg"
        >
          <div className="grid grid-cols-2 gap-2 rounded-xl border-2 border-border bg-background p-1">
            <button
              type="button"
              onClick={() => {
                setMode('sign_in')
                setError(null)
                setInfo(null)
              }}
              className={cn(
                'min-h-11 touch-manipulation rounded-lg text-xs font-bold uppercase tracking-wide',
                mode === 'sign_in'
                  ? 'bg-neon text-neon-foreground'
                  : 'bg-transparent text-muted-foreground',
              )}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('sign_up')
                setError(null)
                setInfo(null)
              }}
              className={cn(
                'min-h-11 touch-manipulation rounded-lg text-xs font-bold uppercase tracking-wide',
                mode === 'sign_up'
                  ? 'bg-neon text-neon-foreground'
                  : 'bg-transparent text-muted-foreground',
              )}
            >
              Sign Up
            </button>
          </div>

          {mode === 'sign_up' ? (
            <label className="block space-y-1.5">
              <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                Display name
              </span>
              <input
                type="text"
                autoComplete="name"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                className="min-h-12 w-full touch-manipulation rounded-xl border-2 border-border bg-background px-4 text-base font-semibold text-foreground"
                placeholder="Coach name"
              />
            </label>
          ) : null}

          <label className="block space-y-1.5">
            <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
              Email
            </span>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="min-h-12 w-full touch-manipulation rounded-xl border-2 border-border bg-background px-4 text-base font-semibold text-foreground"
              placeholder="coach@club.com"
            />
          </label>

          <label className="block space-y-1.5">
            <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
              Password
            </span>
            <input
              type="password"
              required
              minLength={6}
              autoComplete={mode === 'sign_in' ? 'current-password' : 'new-password'}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="min-h-12 w-full touch-manipulation rounded-xl border-2 border-border bg-background px-4 text-base font-semibold text-foreground"
              placeholder="••••••••"
            />
          </label>

          {error ? (
            <p className="rounded-xl border-2 border-danger/50 bg-danger/10 px-3 py-2 text-sm font-bold text-danger">
              {error}
            </p>
          ) : null}
          {info ? (
            <p className="rounded-xl border-2 border-athletic/40 bg-athletic/10 px-3 py-2 text-sm font-bold text-foreground">
              {info}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={busy}
            className="flex min-h-12 w-full touch-manipulation items-center justify-center gap-2 rounded-xl border-2 border-neon bg-neon px-4 text-sm font-bold uppercase tracking-wide text-neon-foreground active:scale-[0.98] disabled:opacity-50"
          >
            {mode === 'sign_in' ? (
              <LockKeyhole className="size-4" strokeWidth={2.5} />
            ) : (
              <UserPlus className="size-4" strokeWidth={2.5} />
            )}
            {busy ? 'Please wait…' : mode === 'sign_in' ? 'Sign In' : 'Create Account'}
          </button>

          <p className="text-center text-xs font-semibold text-muted-foreground">
            New accounts start as Assistant Coach. Directors/Head Coaches can be promoted in
            Supabase.
          </p>
        </form>
      </div>
    </main>
  )
}
