import { Share } from 'lucide-react'
import { isIosDevice, isStandalonePwa } from '@/lib/parent-hub-pwa'

/**
 * Always-visible iOS Safari reminder: Web Push only works after Add to Home Screen.
 * Hidden on Android/desktop and when already running as an installed PWA.
 */
export function IosPushReminderBanner() {
  if (typeof window === 'undefined') return null
  if (!isIosDevice() || isStandalonePwa()) return null

  return (
    <div className="rounded-xl border border-athletic/40 bg-athletic/10 px-3 py-3 text-sm text-foreground">
      <p className="text-[10px] font-bold uppercase tracking-widest text-athletic">
        iPhone / iPad · Live alerts
      </p>
      <p className="mt-1 font-semibold">Add this hub to your Home Screen to enable push alerts.</p>
      <ol className="mt-2 space-y-1.5 text-xs text-muted-foreground">
        <li>
          <span className="font-semibold text-foreground">1.</span> Open this link in Safari
        </li>
        <li>
          <span className="font-semibold text-foreground">2.</span> Tap Share{' '}
          <Share className="inline size-3.5 text-athletic" aria-hidden />
        </li>
        <li>
          <span className="font-semibold text-foreground">3.</span> Add to Home Screen
        </li>
        <li>
          <span className="font-semibold text-foreground">4.</span> Open Velocity from the Home Screen,
          then tap the bell next to your team or game
        </li>
      </ol>
    </div>
  )
}
