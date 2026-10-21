import { createContext, createElement, useCallback, useContext, useRef, useSyncExternalStore, type ReactNode } from 'react'

export type MatchClockStore = {
  get: () => number
  set: (next: number) => void
  subscribe: (listener: () => void) => () => void
}

export function createMatchClockStore(initial = 0): MatchClockStore {
  let seconds = initial
  const listeners = new Set<() => void>()
  return {
    get: () => seconds,
    set(next) {
      if (Object.is(seconds, next)) return
      seconds = next
      for (const listener of listeners) listener()
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}

const MatchClockContext = createContext<MatchClockStore | null>(null)

export function MatchClockProvider({
  store,
  children,
}: {
  store: MatchClockStore
  children: ReactNode
}) {
  return createElement(MatchClockContext.Provider, { value: store }, children)
}

export function useMatchClockStore(): MatchClockStore {
  const store = useContext(MatchClockContext)
  if (!store) {
    throw new Error('Match clock is only available during a coach match')
  }
  return store
}

/** Remaining seconds. Re-renders this component every time the clock changes. */
export function useMatchClockSeconds(): number {
  const store = useMatchClockStore()
  return useSyncExternalStore(store.subscribe, store.get, store.get)
}

/**
 * Re-render only when the selected value changes. A boolean cue stays quiet
 * while the countdown ticks; a formatted label updates when the text changes.
 */
export function useMatchClockSelector<T>(selector: (seconds: number) => T): T {
  const store = useMatchClockStore()
  const selectorRef = useRef(selector)
  const cacheRef = useRef<T | null>(null)
  const hasCacheRef = useRef(false)
  selectorRef.current = selector

  const getSnapshot = useCallback(() => {
    const value = selectorRef.current(store.get())
    if (hasCacheRef.current && Object.is(cacheRef.current, value)) {
      return cacheRef.current as T
    }
    hasCacheRef.current = true
    cacheRef.current = value
    return value
  }, [store])

  return useSyncExternalStore(store.subscribe, getSnapshot, getSnapshot)
}
