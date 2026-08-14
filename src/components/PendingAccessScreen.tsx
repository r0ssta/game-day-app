import { useState } from 'react'
import { SunMedium } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useSunlightMode } from '@/contexts/SunlightModeContext'
import { ClubBrandMark } from '@/components/ClubBrandMark'
import { formatStaffRoleLabel } from '@/lib/staff-roles'
import { APP_CONTAINER, APP_SHELL } from '@/lib/layout'
import { cn } from '@/lib/utils'

export function PendingAccessScreen() {
  const { user, role, signOut, refreshRole } = useAuth()
  const { sunlightMode, toggleSunlightMode } = useSunlightMode()
  const [busy, setBusy] = useState(false)

  return (
    <main className={`${APP_SHELL} flex min-h-dvh items-center justify-center px-4 py-10`}>
      <div className={`${APP_CONTAINER} w-full max-w-md`}>
        <div className="mb-6 flex items-start justify-between gap-3">
          <ClubBrandMark size="md" />
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
        <h1 className="mb-4 font-display text-3xl font-black uppercase tracking-wide text-foreground">
          Access Pending
        </h1>

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
            If you&apos;re the first club account, tap Check Access again after setup finishes.
            Otherwise a Director must assign your role and teams in Club Admin.
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setBusy(true)
              void refreshRole().finally(() => setBusy(false))
            }}
            className="min-h-12 w-full touch-manipulation rounded-xl border-2 border-neon bg-neon px-4 text-sm font-bold uppercase tracking-wide text-neon-foreground disabled:opacity-50"
          >
            {busy ? 'Checking…' : 'Check Access'}
          </button>
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
