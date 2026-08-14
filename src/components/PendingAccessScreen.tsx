import { SunMedium } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useSunlightMode } from '@/contexts/SunlightModeContext'
import { formatStaffRoleLabel } from '@/lib/staff-roles'
import { APP_CONTAINER, APP_SHELL } from '@/lib/layout'
import { cn } from '@/lib/utils'

export function PendingAccessScreen() {
  const { user, role, signOut } = useAuth()
  const { sunlightMode, toggleSunlightMode } = useSunlightMode()

  return (
    <main className={`${APP_SHELL} flex min-h-dvh items-center justify-center px-4 py-10`}>
      <div className={`${APP_CONTAINER} w-full max-w-md`}>
        <div className="mb-6 flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-athletic">Game Day App</p>
            <h1 className="mt-2 font-display text-3xl font-black uppercase tracking-wide text-foreground">
              Access Pending
            </h1>
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

        <div className="auth-panel space-y-4 rounded-2xl border-2 border-border bg-card p-5 shadow-lg">
          <p className="text-sm font-semibold text-foreground">
            You&apos;re signed in as{' '}
            <span className="font-black">{user?.email ?? 'staff'}</span>
            {role ? (
              <>
                {' '}
                ({formatStaffRoleLabel(role)})
              </>
            ) : null}
            .
          </p>
          <p className="text-sm font-semibold text-muted-foreground">
            A Director must assign your club role and team access before you can manage matches.
          </p>
          <button
            type="button"
            onClick={() => void signOut()}
            className="min-h-12 w-full touch-manipulation rounded-xl border-2 border-border bg-secondary px-4 text-sm font-bold uppercase tracking-wide text-foreground"
          >
            Sign Out
          </button>
        </div>
      </div>
    </main>
  )
}
