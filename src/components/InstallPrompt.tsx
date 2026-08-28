import { useEffect, useState } from 'react'
import { Share, X } from 'lucide-react'
import { MODAL_OVERLAY } from '@/lib/layout'
import { cn } from '@/lib/utils'

const DISMISS_KEY = 'vvfc-ios-install-dismissed'

function isIosDevice(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  const iOS = /iPad|iPhone|iPod/.test(ua)
  // iPadOS 13+ reports as MacIntel with touch points
  const iPadOs = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1
  return iOS || iPadOs
}

/** True when the PWA is already installed / launched from the Home Screen. */
function isStandalonePwa(): boolean {
  if (typeof window === 'undefined') return false
  const nav = window.navigator as Navigator & { standalone?: boolean }
  return (
    Boolean(nav.standalone) ||
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: fullscreen)').matches
  )
}

/**
 * Bottom-sheet banner for iOS Safari parents who have not yet installed the Team Hub PWA.
 * Hidden when already running in standalone mode or after dismiss.
 */
export function InstallPrompt({ teamLabel }: { teamLabel?: string }) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!isIosDevice()) return
    if (isStandalonePwa()) return
    try {
      if (sessionStorage.getItem(DISMISS_KEY) === '1') return
    } catch {
      // private mode / blocked storage
    }
    const timer = window.setTimeout(() => setOpen(true), 600)
    return () => window.clearTimeout(timer)
  }, [])

  if (!open) return null

  const dismiss = () => {
    setOpen(false)
    try {
      sessionStorage.setItem(DISMISS_KEY, '1')
    } catch {
      // ignore
    }
  }

  return (
    <div className={cn(MODAL_OVERLAY, 'z-[120]')} role="presentation" onClick={dismiss}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="ios-install-title"
        className="relative z-10 w-full max-w-lg rounded-t-2xl border border-border bg-card px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3 shadow-2xl sm:mb-4 sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-3 h-1.5 w-11 rounded-full bg-border" aria-hidden />

        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              iPhone / iPad
            </p>
            <h2
              id="ios-install-title"
              className="font-display text-2xl font-bold uppercase tracking-wide text-foreground"
            >
              Add {teamLabel ? `${teamLabel} ` : ''}to Home Screen
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Install this hub like an app so live score alerts can reach your lock screen.
            </p>
          </div>
          <button
            type="button"
            onClick={dismiss}
            aria-label="Dismiss install tip"
            className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-secondary text-foreground active:scale-95"
          >
            <X className="size-4" />
          </button>
        </div>

        <ol className="mt-4 space-y-3 text-sm text-foreground">
          <li className="flex gap-3 rounded-xl border border-border bg-secondary/40 px-3 py-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-athletic text-sm font-black text-athletic-foreground">
              1
            </span>
            <div>
              <p className="font-bold">Tap Share</p>
              <p className="mt-0.5 text-muted-foreground">
                In Safari, tap the{' '}
                <span className="inline-flex items-center gap-1 font-semibold text-foreground">
                  Share <Share className="inline size-3.5 text-athletic" aria-hidden />
                </span>{' '}
                icon (bottom center on iPhone, top on iPad).
              </p>
            </div>
          </li>
          <li className="flex gap-3 rounded-xl border border-border bg-secondary/40 px-3 py-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-athletic text-sm font-black text-athletic-foreground">
              2
            </span>
            <div>
              <p className="font-bold">Add to Home Screen</p>
              <p className="mt-0.5 text-muted-foreground">
                Scroll the sheet and choose <span className="font-semibold text-foreground">Add to Home Screen</span>,
                then tap Add.
              </p>
            </div>
          </li>
          <li className="flex gap-3 rounded-xl border border-border bg-secondary/40 px-3 py-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-athletic text-sm font-black text-athletic-foreground">
              3
            </span>
            <div>
              <p className="font-bold">Open from Home Screen</p>
              <p className="mt-0.5 text-muted-foreground">
                Launch the hub icon, then tap <span className="font-semibold text-foreground">Enable Live Score Alerts</span>.
              </p>
            </div>
          </li>
        </ol>

        <button
          type="button"
          onClick={dismiss}
          className="mt-4 flex w-full min-h-12 items-center justify-center rounded-xl border-2 border-border bg-background px-4 py-3 text-sm font-bold uppercase tracking-wide text-foreground active:scale-[0.98]"
        >
          Dismiss
        </button>
      </div>
    </div>
  )
}
