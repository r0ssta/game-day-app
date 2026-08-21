import { useCallback, useEffect, useRef, useState } from 'react'
import NoSleep from 'nosleep.js'

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

export type WakeLockRequestResult = {
  active: boolean
  /** Native API rejected the request (often Low Power / Battery Saver). */
  blockedByOs: boolean
  usedFallback: boolean
}

export const WAKE_LOCK_BLOCKED_TOAST =
  'Wake Lock blocked by OS. Please disable Low Power Mode to keep the screen on.'

function canRequestNativeWakeLock(): boolean {
  if (typeof navigator === 'undefined') return false
  const wakeLock = (navigator as WakeLockNavigator).wakeLock
  return typeof wakeLock?.request === 'function'
}

function isNotAllowedError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const name = 'name' in err ? String((err as { name?: string }).name) : ''
  return name === 'NotAllowedError' || name === 'NotSupportedError'
}

/**
 * Screen stay-awake for live matches.
 *
 * Security rule: `requestWakeLock()` must be invoked directly from a user
 * gesture (Start 1st Half / Start 2nd Half). Do not call it from mount effects.
 * Visibility re-acquire only runs after the user has already armed the lock.
 */
export function useWakeLock(options?: {
  /** When false, releases any held lock / NoSleep session. */
  activeSession?: boolean
}): {
  isActive: boolean
  requestWakeLock: () => Promise<WakeLockRequestResult>
  releaseWakeLock: () => void
} {
  const activeSession = options?.activeSession ?? true
  const [isActive, setIsActive] = useState(false)
  const sentinelRef = useRef<WakeLockSentinelLike | null>(null)
  const noSleepRef = useRef<NoSleep | null>(null)
  /** True only after a successful user-gesture request this session. */
  const armedRef = useRef(false)
  const activeSessionRef = useRef(activeSession)
  activeSessionRef.current = activeSession

  const clearNativeSentinel = useCallback(() => {
    const current = sentinelRef.current
    sentinelRef.current = null
    if (current && !current.released) {
      void current.release().catch(() => {
        /* ignore */
      })
    }
  }, [])

  const releaseWakeLock = useCallback(() => {
    armedRef.current = false
    clearNativeSentinel()
    if (noSleepRef.current?.isEnabled) {
      try {
        noSleepRef.current.disable()
      } catch {
        /* ignore */
      }
    }
    setIsActive(false)
  }, [clearNativeSentinel])

  const enableNoSleepFallback = useCallback(async (): Promise<boolean> => {
    try {
      if (!noSleepRef.current) {
        noSleepRef.current = new NoSleep()
      }
      await noSleepRef.current.enable()
      return Boolean(noSleepRef.current.isEnabled)
    } catch {
      return false
    }
  }, [])

  /**
   * Call this ONLY from Start 1st Half / Start 2nd Half click handlers.
   * Tries native Screen Wake Lock, then NoSleep.js (video / legacy) fallback.
   */
  const requestWakeLock = useCallback(async (): Promise<WakeLockRequestResult> => {
    if (!activeSessionRef.current) {
      return { active: false, blockedByOs: false, usedFallback: false }
    }

    let blockedByOs = false

    if (canRequestNativeWakeLock()) {
      try {
        clearNativeSentinel()
        const wakeLock = (navigator as WakeLockNavigator).wakeLock
        if (!wakeLock) throw new Error('Wake Lock unavailable')

        const sentinel = await wakeLock.request('screen')
        if (!activeSessionRef.current) {
          await sentinel.release().catch(() => {
            /* ignore */
          })
          return { active: false, blockedByOs: false, usedFallback: false }
        }

        const onRelease = () => {
          if (sentinelRef.current === sentinel) {
            sentinelRef.current = null
            // Keep armed so visibilitychange can re-request.
            setIsActive(false)
          }
          sentinel.removeEventListener('release', onRelease)
        }
        sentinel.addEventListener('release', onRelease)
        sentinelRef.current = sentinel
        armedRef.current = true
        setIsActive(true)
        return { active: true, blockedByOs: false, usedFallback: false }
      } catch (err) {
        blockedByOs = isNotAllowedError(err)
        clearNativeSentinel()
      }
    }

    // Native missing or failed — NoSleep.js (video trick on browsers without Wake Lock).
    const fallbackOk = await enableNoSleepFallback()
    if (fallbackOk && activeSessionRef.current) {
      armedRef.current = true
      setIsActive(true)
      return { active: true, blockedByOs, usedFallback: true }
    }

    setIsActive(false)
    return { active: false, blockedByOs, usedFallback: false }
  }, [clearNativeSentinel, enableNoSleepFallback])

  // Re-acquire after tab return — only if the user already armed via Start Half.
  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState !== 'visible') {
        setIsActive(false)
        return
      }
      if (!armedRef.current || !activeSessionRef.current) return
      void requestWakeLock()
    }

    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [requestWakeLock])

  // Drop locks when leaving the live/halftime session.
  useEffect(() => {
    if (!activeSession) {
      releaseWakeLock()
    }
  }, [activeSession, releaseWakeLock])

  useEffect(() => {
    return () => {
      releaseWakeLock()
    }
  }, [releaseWakeLock])

  return { isActive, requestWakeLock, releaseWakeLock }
}
