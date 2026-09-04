import { registerSW } from 'virtual:pwa-register'

type NeedRefreshListener = (needRefresh: boolean) => void

const listeners = new Set<NeedRefreshListener>()
let needRefresh = false
let started = false
let updateServiceWorker: ((reloadPage?: boolean) => Promise<void>) | null = null
let registrationPromise: Promise<ServiceWorkerRegistration | null> | null = null

/** iOS Safari rejects `registration.update()` when the SW graph is empty. */
export function isIgnorableSwUpdateError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const name = 'name' in error ? String(error.name) : ''
  const message = 'message' in error ? String(error.message) : ''
  return name === 'InvalidStateError' && /newestWorker is null/i.test(message)
}

function safeRegistrationUpdate(registration: ServiceWorkerRegistration): void {
  if (!registration.installing && !registration.waiting && !registration.active) {
    return
  }
  void registration.update().catch((error: unknown) => {
    if (!isIgnorableSwUpdateError(error)) {
      console.warn('[sw] update check failed', error)
    }
  })
}

function emitNeedRefresh(next: boolean) {
  needRefresh = next
  for (const listener of listeners) listener(next)
}

export function subscribePwaNeedRefresh(listener: NeedRefreshListener): () => void {
  listeners.add(listener)
  listener(needRefresh)
  return () => {
    listeners.delete(listener)
  }
}

/**
 * Register the Parent Hub service worker via vite-plugin-pwa `registerSW`.
 * A waiting worker (new CI build) raises `needRefresh`; the toast then calls
 * `updateServiceWorker(true)` to skip waiting and load the new shell.
 */
export function registerPwaUpdates(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return Promise.resolve(null)
  }
  if (started && registrationPromise) return registrationPromise

  started = true
  registrationPromise = new Promise((resolve) => {
    let settled = false
    const finish = (registration: ServiceWorkerRegistration | null) => {
      if (settled) return
      settled = true
      resolve(registration)
    }

    updateServiceWorker = registerSW({
      immediate: true,
      onNeedRefresh() {
        emitNeedRefresh(true)
      },
      onRegisteredSW(_swUrl, registration) {
        finish(registration ?? null)
        if (!registration) return
        safeRegistrationUpdate(registration)
        window.setInterval(() => {
          safeRegistrationUpdate(registration)
        }, 60 * 60 * 1000)
      },
      onRegisterError(error) {
        console.warn('[sw] register failed', error)
        finish(null)
      },
    })
  })

  return registrationPromise
}

/** Activate the waiting worker and reload so the new CI build takes over. */
export async function updatePwaServiceWorker(): Promise<void> {
  emitNeedRefresh(false)
  try {
    if (updateServiceWorker) {
      await updateServiceWorker(true)
    }
  } catch (error) {
    if (!isIgnorableSwUpdateError(error)) {
      console.warn('[sw] activate waiting worker failed', error)
    }
    if (typeof window !== 'undefined') {
      window.location.reload()
    }
  }
}
