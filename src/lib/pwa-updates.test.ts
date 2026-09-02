import { beforeAll, describe, expect, it } from 'vitest'
import { __pwaRegisterTest, __triggerNeedRefresh } from '@/test/stubs/virtual-pwa-register'
import {
  registerPwaUpdates,
  subscribePwaNeedRefresh,
  updatePwaServiceWorker,
} from './pwa-updates'

beforeAll(() => {
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: globalThis,
  })
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { serviceWorker: {} },
  })
})

describe('pwa-updates', () => {
  it('registers via registerSW and reports needRefresh', async () => {
    await registerPwaUpdates()
    expect(__pwaRegisterTest().lastOptions?.immediate).toBe(true)

    const seen: boolean[] = []
    const unsubscribe = subscribePwaNeedRefresh((needRefresh) => {
      seen.push(needRefresh)
    })
    __triggerNeedRefresh()
    expect(seen).toContain(true)

    await updatePwaServiceWorker()
    expect(__pwaRegisterTest().lastReloadPage).toBe(true)
    unsubscribe()
  })
})
