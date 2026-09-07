type RegisterSWOptions = {
  immediate?: boolean
  onNeedRefresh?: () => void
  onRegisteredSW?: (swScriptUrl: string, registration?: ServiceWorkerRegistration) => void
  onRegisterError?: (error: unknown) => void
}

let lastOptions: RegisterSWOptions | undefined
let lastReloadPage: boolean | undefined
let updateImpl: (reloadPage?: boolean) => Promise<void> = async (reloadPage) => {
  lastReloadPage = reloadPage
}

export function registerSW(options: RegisterSWOptions = {}) {
  lastOptions = options
  queueMicrotask(() => {
    options.onRegisteredSW?.('/sw.js', undefined)
  })
  return async (reloadPage?: boolean) => {
    lastReloadPage = reloadPage
    await updateImpl(reloadPage)
  }
}

export function __pwaRegisterTest() {
  return { lastOptions, lastReloadPage }
}

export function __triggerNeedRefresh() {
  lastOptions?.onNeedRefresh?.()
}

export function __setUpdateImpl(impl: (reloadPage?: boolean) => Promise<void>) {
  updateImpl = impl
}
