type RegisterSWOptions = {
  immediate?: boolean
  onNeedRefresh?: () => void
  onRegisteredSW?: (swScriptUrl: string, registration?: ServiceWorkerRegistration) => void
  onRegisterError?: (error: unknown) => void
}

let lastOptions: RegisterSWOptions | undefined
let lastReloadPage: boolean | undefined

export function registerSW(options: RegisterSWOptions = {}) {
  lastOptions = options
  queueMicrotask(() => {
    options.onRegisteredSW?.('/sw.js', undefined)
  })
  return async (reloadPage?: boolean) => {
    lastReloadPage = reloadPage
  }
}

export function __pwaRegisterTest() {
  return { lastOptions, lastReloadPage }
}

export function __triggerNeedRefresh() {
  lastOptions?.onNeedRefresh?.()
}
