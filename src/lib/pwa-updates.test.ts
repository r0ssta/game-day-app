import { beforeAll, describe, expect, it, vi } from 'vitest'
import {
  __pwaRegisterTest,
  __setUpdateImpl,
  __triggerNeedRefresh,
} from '@/test/stubs/virtual-pwa-register'
import {
  isIgnorableSwUpdateError,
  registerPwaUpdates,
  subscribePwaNeedRefresh,
  updatePwaServiceWorker,
} from './pwa-updates'

beforeAll(() => {
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { ...globalThis, location: { reload: vi.fn() } },
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

  it('treats iOS newestWorker InvalidStateError as ignorable', () => {
    const error = new DOMException('newestWorker is null', 'InvalidStateError')
    expect(isIgnorableSwUpdateError(error)).toBe(true)
    expect(isIgnorableSwUpdateError(new Error('boom'))).toBe(false)
  })

  it('reloads when activating the waiting worker throws newestWorker is null', async () => {
    await registerPwaUpdates()
    const reload = vi.fn()
    vi.stubGlobal('window', { location: { reload } })
    __setUpdateImpl(async () => {
      throw new DOMException('newestWorker is null', 'InvalidStateError')
    })

    await expect(updatePwaServiceWorker()).resolves.toBeUndefined()
    expect(reload).toHaveBeenCalledOnce()

    __setUpdateImpl(async (reloadPage) => {
      void reloadPage
    })
    vi.unstubAllGlobals()
  })
})
