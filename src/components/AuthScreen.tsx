import { useEffect, useRef, useState, type FormEvent } from 'react'
import { KeyRound, Mail, SunMedium, UserPlus } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useSunlightMode } from '@/contexts/SunlightModeContext'
import { ClubBrandMark } from '@/components/ClubBrandMark'
import { APP_CONTAINER, APP_SHELL } from '@/lib/layout'
import { cn } from '@/lib/utils'

type AuthMode = 'sign_in' | 'register'
type AuthStep = 'email' | 'otp'

const RESEND_COOLDOWN_SECONDS = 60
const OTP_PENDING_KEY = 'gameday.auth.otpPending'
/** GoTrue allows 6–10; this project targets 6 but accepts the full range. */
const OTP_MIN_LENGTH = 6
const OTP_MAX_LENGTH = 10

type OtpPending = {
  email: string
  mode: AuthMode
  resendUntil: number
}

function readOtpPending(): OtpPending | null {
  try {
    const raw = sessionStorage.getItem(OTP_PENDING_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<OtpPending>
    if (typeof parsed.email !== 'string' || !parsed.email.trim()) return null
    return {
      email: parsed.email.trim(),
      mode: parsed.mode === 'register' ? 'register' : 'sign_in',
      resendUntil: typeof parsed.resendUntil === 'number' ? parsed.resendUntil : 0,
    }
  } catch {
    return null
  }
}

function writeOtpPending(pending: OtpPending | null) {
  try {
    if (!pending) {
      sessionStorage.removeItem(OTP_PENDING_KEY)
      return
    }
    sessionStorage.setItem(OTP_PENDING_KEY, JSON.stringify(pending))
  } catch {
    // Ignore storage failures (private mode, quota, etc.).
  }
}

function cooldownSecondsFrom(resendUntil: number) {
  return Math.max(0, Math.ceil((resendUntil - Date.now()) / 1000))
}

export function AuthScreen() {
  const { sendLoginOtp, verifyLoginOtp } = useAuth()
  const { sunlightMode, toggleSunlightMode } = useSunlightMode()
  const restored = useRef(readOtpPending())
  const [mode, setMode] = useState<AuthMode>(restored.current?.mode ?? 'sign_in')
  const [step, setStep] = useState<AuthStep>(restored.current ? 'otp' : 'email')
  const [email, setEmail] = useState(restored.current?.email ?? '')
  const [otp, setOtp] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resendSeconds, setResendSeconds] = useState(() =>
    restored.current ? cooldownSecondsFrom(restored.current.resendUntil) : 0,
  )
  const otpInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (resendSeconds <= 0) return
    const id = window.setTimeout(() => setResendSeconds((s) => Math.max(0, s - 1)), 1000)
    return () => window.clearTimeout(id)
  }, [resendSeconds])

  useEffect(() => {
    if (step !== 'otp') return
    otpInputRef.current?.focus()
  }, [step])

  const resetToEmail = () => {
    writeOtpPending(null)
    setStep('email')
    setOtp('')
    setError(null)
    setResendSeconds(0)
  }

  const enterOtpStep = (targetEmail: string, nextMode: AuthMode) => {
    const trimmed = targetEmail.trim()
    const resendUntil = Date.now() + RESEND_COOLDOWN_SECONDS * 1000
    writeOtpPending({ email: trimmed, mode: nextMode, resendUntil })
    setEmail(trimmed)
    setOtp('')
    setError(null)
    setStep('otp')
    setResendSeconds(RESEND_COOLDOWN_SECONDS)
  }

  const sendCode = async (targetEmail: string) => {
    await sendLoginOtp(targetEmail)
  }

  const onSubmitEmail = async (event: FormEvent) => {
    event.preventDefault()
    const trimmed = email.trim()
    if (!trimmed) {
      setError('Email is required')
      return
    }

    // Advance immediately so switching to Mail (or a suspended tab) still
    // lands on the code entry UI once the email is on its way.
    enterOtpStep(trimmed, mode)
    setBusy(true)
    try {
      await sendCode(trimmed)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send login code')
    } finally {
      setBusy(false)
    }
  }

  const onSubmitOtp = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await verifyLoginOtp(email, otp)
      writeOtpPending(null)
      // AuthProvider onAuthStateChange swaps to the signed-in app shell.
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not verify code')
      setOtp('')
      otpInputRef.current?.focus()
    } finally {
      setBusy(false)
    }
  }

  const onResend = async () => {
    if (resendSeconds > 0 || busy) return
    setBusy(true)
    setError(null)
    try {
      await sendCode(email)
      enterOtpStep(email, mode)
      otpInputRef.current?.focus()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not resend code')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className={`${APP_SHELL} flex min-h-dvh items-center justify-center px-4 py-10`}>
      <div className={`${APP_CONTAINER} w-full max-w-md`}>
        <div className="mb-6 flex items-start justify-between gap-3">
          <ClubBrandMark size="lg" priority />
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
            {step === 'otp'
              ? 'Enter the login code from your email to finish signing in on this device.'
              : mode === 'register'
                ? 'Register for Virginia Velocity Game Day. We email a one-time code — no password.'
                : 'Sign in to Virginia Velocity Game Day with a one-time email code. No password needed.'}
          </p>
        </div>

        <form
          onSubmit={(event) => void (step === 'otp' ? onSubmitOtp(event) : onSubmitEmail(event))}
          className="auth-panel space-y-4 rounded-2xl border-2 border-border bg-card p-5 shadow-lg"
        >
          {step === 'email' ? (
            <div className="grid grid-cols-2 gap-2 rounded-xl border-2 border-border bg-background p-1">
              <button
                type="button"
                onClick={() => {
                  setMode('sign_in')
                  setError(null)
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
          ) : null}

          {step === 'otp' ? (
            <div
              role="status"
              className="auth-otp-panel space-y-4 rounded-xl border-2 border-athletic bg-athletic/15 px-4 py-4"
            >
              <div>
                <p className="text-base font-black uppercase tracking-wide text-foreground">
                  Enter your login code
                </p>
                <p className="mt-2 text-sm font-semibold text-foreground">
                  {busy && otp.length === 0 && !error
                    ? (
                      <>
                        Sending a login code to{' '}
                        <span className="font-black">{email.trim()}</span>…
                      </>
                      )
                    : (
                      <>
                        We sent a login code to{' '}
                        <span className="font-black">{email.trim()}</span>.
                      </>
                      )}
                </p>
              </div>

              <label className="block space-y-1.5">
                <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                  One-time code
                </span>
                <input
                  ref={otpInputRef}
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  autoComplete="one-time-code"
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck={false}
                  maxLength={OTP_MAX_LENGTH}
                  required
                  value={otp}
                  onChange={(event) => {
                    const next = event.target.value.replace(/\D/g, '').slice(0, OTP_MAX_LENGTH)
                    setOtp(next)
                    setError(null)
                  }}
                  className="min-h-14 w-full touch-manipulation rounded-xl border-2 border-border bg-background px-4 text-center font-display text-3xl font-black tracking-[0.35em] text-foreground tabular-nums"
                  placeholder="••••••"
                  aria-label="Login code from email"
                />
              </label>

              {error ? (
                <p className="rounded-xl border-2 border-danger/50 bg-danger/10 px-3 py-2 text-sm font-bold text-danger">
                  {error}
                </p>
              ) : null}

              <button
                type="submit"
                disabled={busy || otp.length < OTP_MIN_LENGTH}
                className="flex min-h-12 w-full touch-manipulation items-center justify-center gap-2 rounded-xl border-2 border-neon bg-neon px-4 text-sm font-bold uppercase tracking-wide text-neon-foreground active:scale-[0.98] disabled:opacity-50"
              >
                <KeyRound className="size-4" strokeWidth={2.5} />
                {busy ? 'Verifying…' : 'Verify Code'}
              </button>

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => void onResend()}
                  disabled={busy || resendSeconds > 0}
                  className="min-h-11 touch-manipulation rounded-xl border-2 border-border bg-background px-4 text-xs font-bold uppercase tracking-wide text-foreground disabled:opacity-50"
                >
                  {resendSeconds > 0 ? `Resend in ${resendSeconds}s` : 'Resend Code'}
                </button>
                <button
                  type="button"
                  onClick={resetToEmail}
                  disabled={busy}
                  className="min-h-11 touch-manipulation rounded-xl border-2 border-border bg-background px-4 text-xs font-bold uppercase tracking-wide text-foreground disabled:opacity-50"
                >
                  Use a different email
                </button>
              </div>
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
                  ? 'Sending code…'
                  : mode === 'register'
                    ? 'Email Me a Sign-Up Code'
                    : 'Email Me a Login Code'}
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
