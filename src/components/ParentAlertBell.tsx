import { useState, type MouseEvent } from 'react'
import { Bell, BellOff, Loader2 } from 'lucide-react'
import {
  canOfferParentWebPush,
  isIosDevice,
  isStandalonePwa,
} from '@/lib/parent-hub-pwa'
import { cn } from '@/lib/utils'

type ParentAlertBellProps = {
  active: boolean
  /** Team follow covers this target — show as on but not independently toggleable. */
  coveredByTeam?: boolean
  disabled?: boolean
  busy?: boolean
  label: string
  onToggle: () => void | Promise<void>
  onNeedsInstall?: () => void
  className?: string
}

/**
 * Compact one-tap alert control for club hub team rows and scoreboard games.
 */
export function ParentAlertBell({
  active,
  coveredByTeam = false,
  disabled = false,
  busy = false,
  label,
  onToggle,
  onNeedsInstall,
  className,
}: ParentAlertBellProps) {
  const [localBusy, setLocalBusy] = useState(false)
  const isBusy = busy || localBusy
  const on = active || coveredByTeam
  const canOffer = canOfferParentWebPush()
  const needsIosInstall = isIosDevice() && !isStandalonePwa()

  const handleClick = async (event: MouseEvent) => {
    event.preventDefault()
    event.stopPropagation()
    if (isBusy || disabled || coveredByTeam) return
    if (needsIosInstall || !canOffer) {
      onNeedsInstall?.()
      return
    }
    setLocalBusy(true)
    try {
      await onToggle()
    } finally {
      setLocalBusy(false)
    }
  }

  return (
    <button
      type="button"
      onClick={(event) => void handleClick(event)}
      disabled={isBusy || disabled || coveredByTeam}
      aria-pressed={on}
      aria-label={
        coveredByTeam
          ? `${label} alerts covered by team follow`
          : on
            ? `Turn off alerts for ${label}`
            : `Turn on alerts for ${label}`
      }
      title={
        coveredByTeam
          ? 'Covered by team alerts'
          : needsIosInstall
            ? 'Add to Home Screen to enable alerts'
            : on
              ? 'Alerts on'
              : 'Enable alerts'
      }
      className={cn(
        'flex size-11 shrink-0 items-center justify-center rounded-xl border touch-manipulation active:scale-95 disabled:opacity-60',
        on
          ? 'border-neon/50 bg-neon/15 text-neon'
          : 'border-border bg-card text-muted-foreground',
        className,
      )}
    >
      {isBusy ? (
        <Loader2 className="size-5 animate-spin" aria-hidden />
      ) : on ? (
        <Bell className="size-5" strokeWidth={2.25} aria-hidden />
      ) : (
        <BellOff className="size-5" strokeWidth={2.25} aria-hidden />
      )}
    </button>
  )
}
