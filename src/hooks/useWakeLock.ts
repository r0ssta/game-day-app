import { useEffect, useRef, useState } from 'react'

type WakeLockSentinelLike = {
  released: boolean
  release: () => Promise<void>
  addEventListener: (type: 'release', listener: () => void) => void
  removeEventListener: (type: 'release', listener: () => void) => void
}

type WakeLockNavigator = Navigator & {
  wakeLock?: {
    request: (type: 'screen') => Promise<WakeLockSentinelLike>
  }
}

function canRequestWakeLock(): boolean {
  if (typeof navigator === 'undefined') return false
  const wakeLock = (navigator as WakeLockNavigator).wakeLock
  return typeof wakeLock?.request === 'function'
}

/**
 * Keeps the screen awake while `enabled` is true (Screen Wake Lock API).
 * Re-acquires automatically after tab/app visibility returns — the OS releases
 * the lock when the page is hidden. Unsupported browsers fail silently.
 */
export function useWakeLock(enabled: boolean): boolean {
  const [isActive, setIsActive] = useState(false)
  const sentinelRef = useRef<WakeLockSentinelLike | null>(null)
  const enabledRef = useRef(enabled)
  enabledRef.current = enabled

  useEffect(() => {
    let cancelled = false

    const clearSentinel = () => {
      const current = sentinelRef.current
      sentinelRef.current = null
      if (current && !current.released) {
        void current.release().catch(() => {
          /* ignore release errors */
        })
      }
      setIsActive(false)
    }

    if (!enabled) {
      clearSentinel()
      return
    }

    if (!canRequestWakeLock()) {
      setIsActive(false)
      return
    }

    const requestLock = async () => {
      if (cancelled || !enabledRef.current) return
      if (document.visibilityState !== 'visible') return

      try {
        // Drop any stale sentinel before requesting a fresh one.
        if (sentinelRef.current && !sentinelRef.current.released) {
          try {
            await sentinelRef.current.release()
          } catch {
            /* ignore */
          }
          sentinelRef.current = null
        }

        const wakeLock = (navigator as WakeLockNavigator).wakeLock
        if (!wakeLock) {
          setIsActive(false)
          return
        }

        const sentinel = await wakeLock.request('screen')
        if (cancelled || !enabledRef.current) {
          await sentinel.release().catch(() => {
            /* ignore */
          })
          return
        }

        const onRelease = () => {
          if (sentinelRef.current === sentinel) {
            sentinelRef.current = null
            setIsActive(false)
          }
          sentinel.removeEventListener('release', onRelease)
        }

        sentinel.addEventListener('release', onRelease)
        sentinelRef.current = sentinel
        setIsActive(true)
      } catch {
        // NotAllowedError, unsupported secure context, low power, etc.
        setIsActive(false)
      }
    }

    void requestLock()

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible' && enabledRef.current) {
        void requestLock()
      } else {
        // OS typically releases already; keep local state in sync.
        setIsActive(false)
        sentinelRef.current = null
      }
    }

    document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisibilityChange)
      clearSentinel()
    }
  }, [enabled])

  return isActive
}
