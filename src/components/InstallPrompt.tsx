import { useEffect, useRef, useState } from 'react'
import { Download, Share, X } from 'lucide-react'
import { MODAL_OVERLAY } from '@/lib/layout'
import { isIosDevice, isStandalonePwa } from '@/lib/parent-hub-pwa'
import { cn } from '@/lib/utils'

const IOS_DISMISS_KEY = 'vvfc-ios-install-dismissed'
const ANDROID_DISMISS_KEY = 'vvfc-android-install-dismissed'

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

function wasDismissed(key: string): boolean {
  try {
    return sessionStorage.getItem(key) === '1'
  } catch {
    return false
  }
}

function markDismissed(key: string) {
  try {
    sessionStorage.setItem(key, '1')
  } catch {
    // private mode / blocked storage
  }
}

/**
 * Parent Hub install UX:
 * - iOS Safari: Share → Add to Home Screen instructions (required for Web Push)
 * - Android / Chromium: capture `beforeinstallprompt` and show a one-tap Install App button
 */
export function InstallPrompt({ teamLabel }: { teamLabel?: string }) {
  const [iosOpen, setIosOpen] = useState(false)
  const [androidOpen, setAndroidOpen] = useState(false)
  const deferredPromptRef = useRef<BeforeInstallPromptEvent | null>(null)
  const [installBusy, setInstallBusy] = useState(false)

  useEffect(() => {
    if (isStandalonePwa()) return

    if (isIosDevice()) {
      if (wasDismissed(IOS_DISMISS_KEY)) return
      const timer = window.setTimeout(() => setIosOpen(true), 600)
      return () => window.clearTimeout(timer)
    }

    if (wasDismissed(ANDROID_DISMISS_KEY)) return

    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault()
      deferredPromptRef.current = event as BeforeInstallPromptEvent
      setAndroidOpen(true)
    }

    const onAppInstalled = () => {
      deferredPromptRef.current = null
      setAndroidOpen(false)
    }

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt)
    window.addEventListener('appinstalled', onAppInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt)
      window.removeEventListener('appinstalled', onAppInstalled)
    }
  }, [])

  const dismissIos = () => {
    setIosOpen(false)
    markDismissed(IOS_DISMISS_KEY)
  }

  const dismissAndroid = () => {
    setAndroidOpen(false)
    markDismissed(ANDROID_DISMISS_KEY)
  }

  const onInstallAndroid = async () => {
    const deferred = deferredPromptRef.current
    if (!deferred || installBusy) return
    setInstallBusy(true)
    try {
      await deferred.prompt()
      const choice = await deferred.userChoice
      deferredPromptRef.current = null
      setAndroidOpen(false)
      if (choice.outcome === 'dismissed') {
        markDismissed(ANDROID_DISMISS_KEY)
      }
    } catch {
      // User closed the sheet or browser rejected; keep the button available.
    } finally {
      setInstallBusy(false)
    }
  }

  if (iosOpen) {
    return (
      <div className={cn(MODAL_OVERLAY, 'z-[120]')} role="presentation" onClick={dismissIos}>
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
              onClick={dismissIos}
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
                  Scroll the sheet and choose{' '}
                  <span className="font-semibold text-foreground">Add to Home Screen</span>, then tap
                  Add.
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
                  Launch the hub icon, then tap{' '}
                  <span className="font-semibold text-foreground">Enable Live Score Alerts</span>.
                </p>
              </div>
            </li>
          </ol>

          <button
            type="button"
            onClick={dismissIos}
            className="mt-4 flex w-full min-h-12 items-center justify-center rounded-xl border-2 border-border bg-background px-4 py-3 text-sm font-bold uppercase tracking-wide text-foreground active:scale-[0.98]"
          >
            Dismiss
          </button>
        </div>
      </div>
    )
  }

  if (!androidOpen) return null

  return (
    <div className="fixed inset-x-0 bottom-[calc(4.25rem+env(safe-area-inset-bottom))] z-[110] px-4">
      <div
        role="region"
        aria-label="Install app"
        className="mx-auto flex w-full max-w-lg items-center gap-3 rounded-2xl border border-neon/40 bg-card px-3 py-3 shadow-2xl"
      >
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-widest text-neon">Install</p>
          <p className="truncate text-sm font-bold text-foreground">
            Add {teamLabel || 'Team Hub'} to your home screen
          </p>
        </div>
        <button
          type="button"
          disabled={installBusy}
          onClick={() => void onInstallAndroid()}
          className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl bg-neon px-3 py-2 text-xs font-black uppercase tracking-wide text-neon-foreground active:scale-95 disabled:opacity-60"
        >
          <Download className="size-4" aria-hidden />
          {installBusy ? '…' : 'Install App'}
        </button>
        <button
          type="button"
          onClick={dismissAndroid}
          aria-label="Dismiss install prompt"
          className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-secondary text-foreground active:scale-95"
        >
          <X className="size-4" />
        </button>
      </div>
    </div>
  )
}
