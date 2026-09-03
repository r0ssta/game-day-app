import { useEffect, useId, useState, type FormEvent, type ReactNode } from 'react'
import {
  BarChart3,
  BellRing,
  CheckCircle2,
  Download,
  Shield,
  Smartphone,
  Star,
  WifiOff,
  Zap,
} from 'lucide-react'
import {
  CLUB_CREST_AVIF_SRC,
  CLUB_CREST_SRC,
  CLUB_CREST_WEBP_SRC,
  CLUB_NAME_FULL,
} from '@/lib/branding'
import { LANDING_PATH, navigateApp } from '@/lib/app-routes'
import { cn } from '@/lib/utils'

const LANDING_TITLE = 'Game Day · Coach-first youth soccer'
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const FEATURES = [
  {
    icon: Smartphone,
    eyebrow: 'Parents',
    title: 'Zero app-store friction',
    body: 'Parents open a link and they are in. Instant PWA install — no App Store, no Google Play, no “which version did you download?” texts at 8:41 a.m.',
  },
  {
    icon: WifiOff,
    eyebrow: 'Sideline',
    title: 'Unbreakable when the field dies',
    body: 'Offline-first architecture plus Optimistic UI. Goals, cards, and subs land the instant you tap — then sync when the cell tower remembers you exist.',
  },
  {
    icon: Zap,
    eyebrow: 'Focus',
    title: 'The screen stays on. You stay in the game.',
    body: 'Screen Wake Lock keeps the pitch live through 80 minutes. No lock-screen, no ad, no snack-duty banner stealing the next substitution window.',
  },
  {
    icon: BellRing,
    eyebrow: 'Live',
    title: 'Pro-level alerts, not spam',
    body: 'Live Web Push hits lock screens on kickoff, goals, cards, and full time. Parents follow the match. Coaches are not running a group chat.',
  },
  {
    icon: BarChart3,
    eyebrow: 'Match',
    title: 'Advanced stats, not box-score leftovers',
    body: 'Plus/minus, playing time, shots, saves, and lineup chemistry — the same ledger you trust after the whistle, not a screenshot from someone else’s phone.',
  },
  {
    icon: Star,
    eyebrow: 'Season',
    title: 'Player ratings that actually compound',
    body: 'Post-match 1–5 ratings roll into season averages and development dossiers. Directors see growth. Coaches stop coaching from memory.',
  },
] as const

const EXPANSION_CLUBS = [
  { name: 'Richmond United', initials: 'RU', city: 'Richmond, VA' },
  { name: 'FC Richmond', initials: 'FCR', city: 'Richmond, VA' },
  { name: 'Williamsburg Legacy', initials: 'WL', city: 'Williamsburg, VA' },
] as const

export function LandingPage() {
  const emailId = useId()
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => {
    const previous = document.title
    document.title = LANDING_TITLE
    return () => {
      document.title = previous
    }
  }, [])

  useEffect(() => {
    if (!toast) return
    const id = window.setTimeout(() => setToast(null), 4200)
    return () => window.clearTimeout(id)
  }, [toast])

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const trimmed = email.trim().toLowerCase()
    if (!EMAIL_RE.test(trimmed)) {
      setError('Enter a valid email to join the waitlist.')
      return
    }

    console.log('[waitlist]', { email: trimmed, source: 'landing' })
    setError(null)
    setEmail('')
    setToast('You are on the list. We will be in touch.')
  }

  return (
    <div className="landing-page min-h-dvh bg-[#07090d] text-white">
      <div className="landing-pitch-grid pointer-events-none fixed inset-0" aria-hidden />

      <header className="relative z-10 border-b border-white/10">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <a href={LANDING_PATH} className="flex items-center gap-2.5 no-underline">
            <span className="flex size-9 items-center justify-center rounded-lg border border-[#39FF8A]/40 bg-[#39FF8A]/10 font-display text-lg leading-none text-[#39FF8A]">
              GD
            </span>
            <span>
              <span className="block font-display text-xl leading-none tracking-wide text-white">
                GAME DAY
              </span>
              <span className="mt-0.5 block text-[10px] font-bold uppercase tracking-[0.22em] text-[#39FF8A]">
                Coach-first
              </span>
            </span>
          </a>
          <button
            type="button"
            onClick={() => navigateApp('/')}
            className="min-h-11 touch-manipulation rounded-xl border border-white/15 px-3 text-xs font-bold uppercase tracking-wide text-white/80 transition-colors hover:border-[#39FF8A]/50 hover:text-[#39FF8A]"
          >
            Staff Login
          </button>
        </div>
      </header>

      <main className="relative z-10">
        <section className="mx-auto grid max-w-6xl gap-10 px-4 pb-16 pt-12 sm:px-6 md:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] md:items-end md:pb-20 md:pt-16">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-[#39FF8A]/30 bg-[#39FF8A]/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-[#39FF8A]">
              <Shield className="size-3.5" strokeWidth={2.5} />
              Next-generation. Coach-first.
            </p>
            <h1 className="mt-5 font-display text-[3.15rem] leading-[0.88] tracking-wide text-white sm:text-7xl md:text-[5.4rem]">
              Built for the whistle.
              <span className="block text-[#39FF8A]">Not the app store.</span>
            </h1>
            <p className="mt-6 max-w-xl text-base font-medium leading-relaxed text-white/70 sm:text-lg">
              Game Day is the sideline operating system elite youth clubs actually finish a match
              on. A coach-first alternative to bloated, ad-heavy legacy apps — TeamSnap for
              registration, GameChanger for baseball noise. This one is for the whistle.
            </p>
          </div>

          <form
            onSubmit={onSubmit}
            className="rounded-3xl border border-[#39FF8A]/25 bg-[#0c1018]/90 p-5 shadow-[0_0_80px_-24px_rgba(57,255,138,0.55)] sm:p-6"
          >
            <p className="font-display text-3xl tracking-wide text-white">Join the waitlist</p>
            <p className="mt-2 text-sm font-semibold text-white/60">
              Be first when we open the next Mid-Atlantic club. No spam. No app-store tax.
            </p>
            <label htmlFor={emailId} className="mt-5 block text-[11px] font-bold uppercase tracking-widest text-white/45">
              Email
            </label>
            <input
              id={emailId}
              type="email"
              autoComplete="email"
              inputMode="email"
              required
              value={email}
              onChange={(event) => {
                setEmail(event.target.value)
                setError(null)
              }}
              placeholder="director@yourclub.com"
              className="mt-2 min-h-12 w-full touch-manipulation rounded-xl border border-white/15 bg-[#07090d] px-4 text-base font-semibold text-white placeholder:text-white/30 focus:border-[#39FF8A] focus:outline-none"
            />
            {error ? (
              <p className="mt-2 text-sm font-bold text-red-400" role="alert">
                {error}
              </p>
            ) : null}
            <button
              type="submit"
              className="mt-4 flex min-h-12 w-full touch-manipulation items-center justify-center rounded-xl bg-[#39FF8A] px-4 text-sm font-black uppercase tracking-wide text-[#07140d] transition-transform active:scale-[0.98]"
            >
              Join the Waitlist
            </button>
            <p className="mt-3 text-center text-xs font-semibold text-white/40">
              Club directors and DOC staff only. No parent spam list.
            </p>
          </form>
        </section>

        <section
          aria-label="Social proof"
          className="border-y border-[#39FF8A]/25 bg-[#39FF8A]/8"
        >
          <div className="mx-auto flex max-w-6xl flex-col items-center justify-center gap-4 px-4 py-6 sm:flex-row sm:px-6">
            <VelocityCrest className="size-16 sm:size-14" />
            <div className="text-center sm:text-left">
              <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-[#39FF8A]">
                Currently powering
              </p>
              <p className="font-display text-3xl tracking-wide text-white sm:text-4xl">
                Virginia Velocity FC
              </p>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 md:py-20">
          <div className="max-w-2xl">
            <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-[#39FF8A]">
              Why we are different
            </p>
            <h2 className="mt-3 font-display text-4xl tracking-wide text-white sm:text-5xl">
              Legacy sports apps sell chaos. We sell a clean sideline.
            </h2>
            <p className="mt-4 text-sm font-medium leading-relaxed text-white/65 sm:text-base">
              Every feature below is already in the product — PWA Parent Hub, optimistic match
              writes, Screen Wake Lock, Web Push, plus/minus, and season player ratings. The
              marketing is the architecture.
            </p>
          </div>

          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((feature, index) => {
              const Icon = feature.icon
              return (
                <article
                  key={feature.title}
                  className="rounded-2xl border border-white/10 bg-[#0c1018]/80 p-5 transition-colors hover:border-[#39FF8A]/40"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="flex size-11 items-center justify-center rounded-xl border border-[#39FF8A]/25 bg-[#39FF8A]/10 text-[#39FF8A]">
                      <Icon className="size-5" strokeWidth={2.25} />
                    </span>
                    <span className="font-display text-2xl text-white/20">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                  </div>
                  <p className="mt-4 text-[11px] font-bold uppercase tracking-[0.18em] text-[#39FF8A]">
                    {feature.eyebrow}
                  </p>
                  <h3 className="mt-1 text-lg font-bold leading-snug text-white">{feature.title}</h3>
                  <p className="mt-2 text-sm font-medium leading-relaxed text-white/60">{feature.body}</p>
                </article>
              )
            })}
          </div>
        </section>

        <section className="border-y border-white/10 bg-[#0a0e14]">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 md:py-20">
            <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-[#39FF8A]">
              Club expansion
            </p>
            <h2 className="mt-3 max-w-3xl font-display text-4xl tracking-wide text-white sm:text-5xl">
              Built for the Mid-Atlantic&apos;s Elite Clubs
            </h2>
            <p className="mt-4 max-w-2xl text-sm font-medium leading-relaxed text-white/65 sm:text-base">
              One platform for every age group, every coach, every Saturday. Seasons, staff
              invites, player pools, and development reports — club-scale from day one, not a
              team chat that grew a payment form.
            </p>

            <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <ClubCard
                name={CLUB_NAME_FULL}
                city="Ashburn / Northern Virginia"
                status="Live today"
                live
              >
                <VelocityCrest className="size-16" />
              </ClubCard>
              {EXPANSION_CLUBS.map((club) => (
                <ClubCard key={club.name} name={club.name} city={club.city} status="Expansion">
                  <div
                    role="img"
                    aria-label={`${club.name} logo placeholder`}
                    className="flex size-16 items-center justify-center rounded-full border border-dashed border-[#39FF8A]/45 bg-[#39FF8A]/8 font-display text-xl tracking-wide text-[#39FF8A]"
                  >
                    {club.initials}
                  </div>
                </ClubCard>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <div className="rounded-3xl border border-[#39FF8A]/30 bg-gradient-to-br from-[#39FF8A]/12 to-transparent px-5 py-10 text-center sm:px-10">
            <Download className="mx-auto size-8 text-[#39FF8A]" strokeWidth={2} />
            <h2 className="mt-4 font-display text-4xl tracking-wide text-white sm:text-5xl">
              Parents install in one tap. Coaches never leave the pitch.
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-sm font-medium text-white/65 sm:text-base">
              Share a hub link. They add it to the home screen. Live scores, schedule, recaps, and
              push alerts — without creating an account, and without giving Apple 30%.
            </p>
            <a
              href="#waitlist"
              onClick={(event) => {
                event.preventDefault()
                document.getElementById(emailId)?.focus()
                window.scrollTo({ top: 0, behavior: 'smooth' })
              }}
              className="mt-6 inline-flex min-h-12 items-center justify-center rounded-xl bg-[#39FF8A] px-6 text-sm font-black uppercase tracking-wide text-[#07140d]"
            >
              Request club access
            </a>
          </div>
        </section>
      </main>

      <footer className="relative z-10 border-t border-white/10 px-4 py-8 sm:px-6">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 text-center sm:flex-row sm:text-left">
          <p className="text-xs font-semibold text-white/40">
            Game Day · Coach-first match control for youth soccer
          </p>
          <button
            type="button"
            onClick={() => navigateApp('/')}
            className="text-xs font-bold uppercase tracking-wide text-white/50 hover:text-[#39FF8A]"
          >
            Staff / Admin
          </button>
        </div>
      </footer>

      {toast ? (
        <div className="pointer-events-none fixed inset-x-0 bottom-6 z-[90] flex justify-center px-4">
          <div
            role="status"
            aria-live="polite"
            className="flex items-center gap-2 rounded-full bg-[#39FF8A] px-4 py-2.5 text-sm font-bold text-[#07140d] shadow-lg"
          >
            <CheckCircle2 className="size-5" strokeWidth={2.5} />
            {toast}
          </div>
        </div>
      ) : null}
    </div>
  )
}

function VelocityCrest({ className }: { className?: string }) {
  return (
    <picture>
      <source type="image/avif" srcSet={CLUB_CREST_AVIF_SRC} />
      <source type="image/webp" srcSet={CLUB_CREST_WEBP_SRC} />
      <img
        src={CLUB_CREST_SRC}
        alt={`${CLUB_NAME_FULL} crest`}
        className={cn('object-contain drop-shadow-md', className)}
        width={64}
        height={64}
        decoding="async"
      />
    </picture>
  )
}

function ClubCard({
  name,
  city,
  status,
  live,
  children,
}: {
  name: string
  city: string
  status: string
  live?: boolean
  children: ReactNode
}) {
  return (
    <article className="flex flex-col items-center rounded-2xl border border-white/10 bg-[#07090d] px-4 py-6 text-center">
      {children}
      <h3 className="mt-4 font-display text-2xl tracking-wide text-white">{name}</h3>
      <p className="mt-1 text-xs font-semibold text-white/50">{city}</p>
      <p
        className={cn(
          'mt-3 text-[10px] font-bold uppercase tracking-[0.18em]',
          live ? 'text-[#39FF8A]' : 'text-white/35',
        )}
      >
        {status}
      </p>
    </article>
  )
}
