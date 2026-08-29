import { useEffect, useMemo, useState } from 'react'
import { Bell, CheckCircle2, Loader2, RefreshCw } from 'lucide-react'
import { formatPlayerFullName } from '@/lib/player-names'
import {
  getPushServerSynced,
  setLocalPushEnabled,
  subscribeParentWebPush,
  syncExistingParentWebPush,
  type ParentHubPlayer,
} from '@/lib/parent-hub'
import {
  canOfferParentWebPush,
} from '@/lib/parent-hub-pwa'
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
 * Visible in normal browser tabs on Android / desktop (Web Push works without install).
 * On iOS, only shown from an installed Home Screen / standalone launch — Apple requires it.
 *
 * Important: creating a new PushSubscription on iOS requires a user gesture. We never call
 * pushManager.subscribe() from useEffect — only upsert an existing sub, or wait for a tap.
 */
export function EnableAlertsButton({ teamId, players, className }: EnableAlertsButtonProps) {
  const [canOffer, setCanOffer] = useState(() => canOfferParentWebPush())
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
    const sync = () => setCanOffer(canOfferParentWebPush())
    sync()
    const mediaStandalone = window.matchMedia('(display-mode: standalone)')
    const mediaFullscreen = window.matchMedia('(display-mode: fullscreen)')
    mediaStandalone.addEventListener('change', sync)
    mediaFullscreen.addEventListener('change', sync)
    return () => {
      mediaStandalone.removeEventListener('change', sync)
      mediaFullscreen.removeEventListener('change', sync)
    }
  }, [])

  useEffect(() => {
    if (!canOffer) {
      setChecking(false)
      return
    }
    let cancelled = false
    setChecking(true)
    void (async () => {
      try {
        // Safe without a gesture: only re-save an existing browser subscription.
        const synced = await syncExistingParentWebPush({ teamId })
        if (cancelled) return
        if (synced) {
          setLocalPushEnabled(teamId, true)
          setEnabled(true)
          return
        }
        // Do not trust stale localStorage — phone may say enabled with nothing on the server.
        if (getPushServerSynced(teamId)) {
          setLocalPushEnabled(teamId, false)
        }
        setEnabled(false)
      } catch (err) {
        if (cancelled) return
        setEnabled(false)
        setLocalPushEnabled(teamId, false)
        setError(err instanceof Error ? err.message : 'Could not sync alerts')
      } finally {
        if (!cancelled) setChecking(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [teamId, canOffer])

  // iOS Safari tabs (non-standalone) and unsupported browsers stay hidden.
  if (!canOffer) return null

  const onEnable = async () => {
    setBusy(true)
    setError(null)
    try {
      await subscribeParentWebPush({
        teamId,
        targetPlayerId: targetPlayerId || null,
        forceRefresh: true,
      })
      setLocalPushEnabled(teamId, true)
      setEnabled(true)
    } catch (err) {
      setLocalPushEnabled(teamId, false)
      setEnabled(false)
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
      <div className={cn('space-y-2', className)}>
        <div
          className="flex min-h-14 items-center justify-center gap-2 rounded-xl border border-neon/40 bg-neon/10 px-4 text-sm font-bold text-foreground"
          role="status"
        >
          <CheckCircle2 className="size-5 text-neon" aria-hidden />
          Alerts Enabled
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() => void onEnable()}
          className="flex w-full min-h-11 touch-manipulation items-center justify-center gap-2 rounded-xl border border-border bg-card px-3 py-2.5 text-xs font-bold uppercase tracking-wide text-muted-foreground disabled:opacity-50"
        >
          {busy ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <RefreshCw className="size-4" aria-hidden />
          )}
          {busy ? 'Reconnecting…' : 'Reconnect alerts'}
        </button>
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
