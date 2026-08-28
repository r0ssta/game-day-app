import { useEffect, useMemo, useState } from 'react'
import { Bell, CheckCircle2, Loader2 } from 'lucide-react'
import { formatPlayerFullName } from '@/lib/player-names'
import {
  getLocalPushEnabled,
  hasActivePushSubscription,
  setLocalPushEnabled,
  subscribeParentWebPush,
  type ParentHubPlayer,
} from '@/lib/parent-hub'
import { isStandalonePwa } from '@/lib/parent-hub-pwa'
import { cn } from '@/lib/utils'

type EnableAlertsButtonProps = {
  teamId: string
  players: ParentHubPlayer[]
  className?: string
}

/**
 * Parent Hub opt-in: request notification permission, subscribe with the VAPID public key,
 * and persist the PushSubscription (+ optional target player) via Supabase.
 *
 * Hidden outside installed / standalone display mode — iOS Safari rejects Web Push
 * with an Apple support error unless the page was launched from the Home Screen.
 */
export function EnableAlertsButton({ teamId, players, className }: EnableAlertsButtonProps) {
  const [standalone, setStandalone] = useState(() => isStandalonePwa())
  const [targetPlayerId, setTargetPlayerId] = useState('')
  const [busy, setBusy] = useState(false)
  const [enabled, setEnabled] = useState(false)
  const [checking, setChecking] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const rosterOptions = useMemo(() => {
    return [...players].sort((a, b) => {
      const an = a.number ?? 999
      const bn = b.number ?? 999
      if (an !== bn) return an - bn
      return formatPlayerFullName(a.firstName, a.lastName).localeCompare(
        formatPlayerFullName(b.firstName, b.lastName),
      )
    })
  }, [players])

  useEffect(() => {
    const syncStandalone = () => setStandalone(isStandalonePwa())
    syncStandalone()
    const mediaStandalone = window.matchMedia('(display-mode: standalone)')
    const mediaFullscreen = window.matchMedia('(display-mode: fullscreen)')
    mediaStandalone.addEventListener('change', syncStandalone)
    mediaFullscreen.addEventListener('change', syncStandalone)
    return () => {
      mediaStandalone.removeEventListener('change', syncStandalone)
      mediaFullscreen.removeEventListener('change', syncStandalone)
    }
  }, [])

  useEffect(() => {
    if (!standalone) {
      setChecking(false)
      return
    }
    let cancelled = false
    setChecking(true)
    void (async () => {
      try {
        if (getLocalPushEnabled(teamId)) {
          if (!cancelled) setEnabled(true)
          return
        }
        const active = await hasActivePushSubscription()
        if (!cancelled && active) {
          setLocalPushEnabled(teamId, true)
          setEnabled(true)
        }
      } finally {
        if (!cancelled) setChecking(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [teamId, standalone])

  // Regular Safari / browser tabs must not offer the button (Apple Web Push restriction).
  if (!standalone) return null

  const onEnable = async () => {
    setBusy(true)
    setError(null)
    try {
      await subscribeParentWebPush({
        teamId,
        targetPlayerId: targetPlayerId || null,
      })
      setLocalPushEnabled(teamId, true)
      setEnabled(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not enable alerts')
    } finally {
      setBusy(false)
    }
  }

  if (checking) {
    return (
      <div
        className={cn(
          'flex min-h-14 items-center justify-center rounded-xl border border-border bg-card px-4 text-sm font-semibold text-muted-foreground',
          className,
        )}
      >
        <Loader2 className="mr-2 size-4 animate-spin" />
        Checking alert status…
      </div>
    )
  }

  if (enabled) {
    return (
      <div
        className={cn(
          'flex min-h-14 items-center justify-center gap-2 rounded-xl border border-neon/40 bg-neon/10 px-4 text-sm font-bold text-foreground',
          className,
        )}
        role="status"
      >
        <CheckCircle2 className="size-5 text-neon" aria-hidden />
        Alerts Enabled
      </div>
    )
  }

  return (
    <div className={cn('space-y-3 rounded-xl border border-border bg-card p-3', className)}>
      <div>
        <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
          Live Score Alerts
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          Get lock-screen updates for goals, cards, and period changes. Optionally add sub alerts
          for one player.
        </p>
      </div>

      <label className="block">
        <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
          Sub alerts for a specific player? (optional)
        </span>
        <select
          value={targetPlayerId}
          onChange={(e) => setTargetPlayerId(e.target.value)}
          disabled={busy}
          className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm font-semibold text-foreground disabled:opacity-60"
        >
          <option value="">General updates only</option>
          {rosterOptions.map((player) => {
            const name = formatPlayerFullName(player.firstName, player.lastName)
            const label = player.number != null ? `#${player.number} ${name}` : name
            return (
              <option key={player.id} value={player.id}>
                {label}
              </option>
            )
          })}
        </select>
      </label>

      {error ? (
        <p className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-xs font-semibold text-danger">
          {error}
        </p>
      ) : null}

      <button
        type="button"
        disabled={busy}
        onClick={() => void onEnable()}
        className="flex w-full min-h-14 touch-manipulation items-center justify-center gap-2 rounded-2xl bg-neon px-4 py-4 text-neon-foreground shadow-xl shadow-neon/25 transition-transform active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? (
          <Loader2 className="size-5 animate-spin" aria-hidden />
        ) : (
          <Bell className="size-5" aria-hidden />
        )}
        <span className="font-display text-xl font-black uppercase tracking-wide">
          {busy ? 'Enabling…' : 'Enable Live Score Alerts'}
        </span>
      </button>
    </div>
  )
}
