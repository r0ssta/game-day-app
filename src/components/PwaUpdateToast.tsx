import { useEffect, useState } from 'react'
import {
  registerPwaUpdates,
  subscribePwaNeedRefresh,
  updatePwaServiceWorker,
} from '@/lib/pwa-updates'

export function PwaUpdateToast() {
  const [visible, setVisible] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void registerPwaUpdates()
    const unsubscribe = subscribePwaNeedRefresh(setVisible)
    // Local-only: /hub/:slug?pwaUpdatePreview=1 shows the toast without a waiting worker.
    if (
      import.meta.env.DEV &&
      new URLSearchParams(window.location.search).get('pwaUpdatePreview') === '1'
    ) {
      setVisible(true)
    }
    return unsubscribe
  }, [])

  if (!visible) return null

  return (
    <div className="fixed inset-x-0 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-[130] px-4">
      <div
        role="status"
        aria-live="polite"
        className="mx-auto flex w-full max-w-lg items-center gap-3 rounded-2xl border border-neon/40 bg-card px-3 py-3 shadow-2xl"
      >
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-widest text-neon">
            Update available
          </p>
          <p className="text-sm font-bold text-foreground">A new version is ready.</p>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setBusy(true)
            void updatePwaServiceWorker().finally(() => setBusy(false))
          }}
          className="flex min-h-11 shrink-0 items-center rounded-xl bg-neon px-3 py-2 text-xs font-black uppercase tracking-wide text-neon-foreground active:scale-95 disabled:opacity-60"
        >
          Refresh to update app
        </button>
      </div>
    </div>
  )
}
