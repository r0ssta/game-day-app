import { useState, type FormEvent } from 'react'
import { Mail, SunMedium } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useSunlightMode } from '@/contexts/SunlightModeContext'
import { APP_CONTAINER, APP_SHELL } from '@/lib/layout'
import { cn } from '@/lib/utils'

export function AuthScreen() {
  const { signInWithMagicLink } = useAuth()
  const { sunlightMode, toggleSunlightMode } = useSunlightMode()
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
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-athletic">Game Day App</p>
            <h1 className="mt-2 font-display text-4xl font-black uppercase tracking-wide text-foreground">
              Staff Login
            </h1>
            <p className="mt-2 text-sm font-semibold text-muted-foreground">
              Enter your email and we&apos;ll send a one-time magic link. No password needed.
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
                this device to finish signing in.
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
                <Mail className="size-4" strokeWidth={2.5} />
                {busy ? 'Sending link…' : 'Email Me a Login Link'}
              </button>
            </>
          )}

          <p className="text-center text-xs font-semibold text-muted-foreground">
            New accounts start as Pending until a Director assigns a role and teams.
          </p>
        </form>
      </div>
    </main>
  )
}
