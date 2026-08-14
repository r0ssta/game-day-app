import { useState, type FormEvent } from 'react'
import { Mail, SunMedium, UserPlus } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useSunlightMode } from '@/contexts/SunlightModeContext'
import { ClubBrandMark } from '@/components/ClubBrandMark'
import { APP_CONTAINER, APP_SHELL } from '@/lib/layout'
import { cn } from '@/lib/utils'

type AuthMode = 'sign_in' | 'register'

export function AuthScreen() {
  const { signInWithMagicLink } = useAuth()
  const { sunlightMode, toggleSunlightMode } = useSunlightMode()
  const [mode, setMode] = useState<AuthMode>('sign_in')
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [linkSent, setLinkSent] = useState(false)

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    setLinkSent(false)
    try {
      await signInWithMagicLink(email)
      setLinkSent(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send login link')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className={`${APP_SHELL} flex min-h-dvh items-center justify-center px-4 py-10`}>
      <div className={`${APP_CONTAINER} w-full max-w-md`}>
        <div className="mb-6 flex items-start justify-between gap-3">
          <ClubBrandMark size="lg" />
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
        <div className="mb-6">
          <h1 className="font-display text-4xl font-black uppercase tracking-wide text-foreground">
            {mode === 'register' ? 'Create Account' : 'Staff Login'}
          </h1>
          <p className="mt-2 text-sm font-semibold text-muted-foreground">
            {mode === 'register'
              ? 'Register for Virginia Velocity Game Day. We will create your account and send a magic link — no password.'
              : 'Sign in to Virginia Velocity Game Day with a one-time magic link. No password needed.'}
          </p>
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
                setLinkSent(false)
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
                setMode('register')
                setError(null)
                setLinkSent(false)
              }}
              className={cn(
                'min-h-11 touch-manipulation rounded-lg text-xs font-bold uppercase tracking-wide',
                mode === 'register'
                  ? 'bg-neon text-neon-foreground'
                  : 'bg-transparent text-muted-foreground',
              )}
            >
              Create Account
            </button>
          </div>

          {linkSent ? (
            <div
              role="status"
              className="auth-magic-success rounded-xl border-2 border-athletic bg-athletic/15 px-4 py-4"
            >
              <p className="text-base font-black uppercase tracking-wide text-foreground">
                Check your email for the login link!
              </p>
              <p className="mt-2 text-sm font-semibold text-foreground">
                We sent a magic link to <span className="font-black">{email.trim()}</span>. Open it on
                this device to finish{' '}
                {mode === 'register' ? 'creating your account' : 'signing in'}.
              </p>
              <button
                type="button"
                onClick={() => {
                  setLinkSent(false)
                  setError(null)
                }}
                className="mt-4 min-h-11 w-full touch-manipulation rounded-xl border-2 border-border bg-background px-4 text-xs font-bold uppercase tracking-wide text-foreground"
              >
                Use a different email
              </button>
            </div>
          ) : (
            <>
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

              {error ? (
                <p className="rounded-xl border-2 border-danger/50 bg-danger/10 px-3 py-2 text-sm font-bold text-danger">
                  {error}
                </p>
              ) : null}

              <button
                type="submit"
                disabled={busy}
                className="flex min-h-12 w-full touch-manipulation items-center justify-center gap-2 rounded-xl border-2 border-neon bg-neon px-4 text-sm font-bold uppercase tracking-wide text-neon-foreground active:scale-[0.98] disabled:opacity-50"
              >
                {mode === 'register' ? (
                  <UserPlus className="size-4" strokeWidth={2.5} />
                ) : (
                  <Mail className="size-4" strokeWidth={2.5} />
                )}
                {busy
                  ? 'Sending link…'
                  : mode === 'register'
                    ? 'Email Me a Sign-Up Link'
                    : 'Email Me a Login Link'}
              </button>
            </>
          )}

          <p className="text-center text-xs font-semibold text-muted-foreground">
            {mode === 'register'
              ? 'The first account becomes Club Director automatically. Later sign-ups wait for a Director to assign a role and teams.'
              : 'Already registered? Use Sign In. New to the club? Switch to Create Account.'}
          </p>
        </form>
      </div>
    </main>
  )
}
