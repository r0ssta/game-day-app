import { lazy, type ComponentType, type LazyExoticComponent } from 'react'

const RELOAD_KEY = 'gda:stale-chunk-reload'

export function isStaleChunkError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Loading chunk [\w-]+ failed/i.test(
    message,
  )
}

function readReloadFlag(): boolean {
  try {
    return sessionStorage.getItem(RELOAD_KEY) === '1'
  } catch {
    return false
  }
}

function writeReloadFlag(value: boolean): void {
  try {
    if (value) sessionStorage.setItem(RELOAD_KEY, '1')
    else sessionStorage.removeItem(RELOAD_KEY)
  } catch {
    // Private mode can block sessionStorage; skip the reload guard.
  }
}

/**
 * After a Vite deploy, hashed chunks disappear. A tab that still has the old
 * entry tries to lazy-load them and throws. Reload once to pick up the new shell.
 */
export function loadWithChunkReload<T>(importer: () => Promise<T>): Promise<T> {
  return importer().then(
    (mod) => {
      writeReloadFlag(false)
      return mod
    },
    (error: unknown) => {
      if (typeof window !== 'undefined' && isStaleChunkError(error) && !readReloadFlag()) {
        writeReloadFlag(true)
        window.location.reload()
        return new Promise<T>(() => undefined)
      }
      throw error
    },
  )
}

export function lazyWithChunkReload<T extends ComponentType<any>>(
  importer: () => Promise<{ default: T }>,
): LazyExoticComponent<T> {
  return lazy(() => loadWithChunkReload(importer))
}
