import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { isStaleChunkError, loadWithChunkReload } from './lazy-import'

const RELOAD_KEY = 'gda:stale-chunk-reload'

function memoryStorage() {
  const store = new Map<string, string>()
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value)
    },
    removeItem: (key: string) => {
      store.delete(key)
    },
    clear: () => {
      store.clear()
    },
  }
}

beforeEach(() => {
  const reload = vi.fn()
  const storage = memoryStorage()
  vi.stubGlobal('window', { location: { reload } })
  vi.stubGlobal('sessionStorage', storage)
  vi.stubGlobal('location', { reload })
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('isStaleChunkError', () => {
  it('matches the browser dynamic-import miss', () => {
    expect(
      isStaleChunkError(
        new TypeError(
          'Failed to fetch dynamically imported module: https://game-day-app-chvm.vercel.app/assets/App-Cd88tDpQ.js',
        ),
      ),
    ).toBe(true)
  })

  it('ignores unrelated failures', () => {
    expect(isStaleChunkError(new TypeError('NetworkError when attempting to fetch resource.'))).toBe(
      false,
    )
  })
})

describe('loadWithChunkReload', () => {
  it('returns the module and clears a prior reload flag', async () => {
    sessionStorage.setItem(RELOAD_KEY, '1')
    await expect(loadWithChunkReload(async () => ({ ok: true }))).resolves.toEqual({ ok: true })
    expect(sessionStorage.getItem(RELOAD_KEY)).toBeNull()
  })

  it('reloads once on a stale chunk, then throws if it happens again', async () => {
    const stale = new TypeError(
      'Failed to fetch dynamically imported module: https://example.test/assets/App-Cd88tDpQ.js',
    )

    void loadWithChunkReload(() => Promise.reject(stale))
    await vi.waitFor(() => {
      expect(window.location.reload).toHaveBeenCalledTimes(1)
    })
    expect(sessionStorage.getItem(RELOAD_KEY)).toBe('1')

    await expect(loadWithChunkReload(() => Promise.reject(stale))).rejects.toBe(stale)
    expect(window.location.reload).toHaveBeenCalledTimes(1)
  })
})
