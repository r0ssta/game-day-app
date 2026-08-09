import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { persistSunlightMode, readSunlightMode } from '@/lib/sunlight-mode'

type SunlightModeContextValue = {
  sunlightMode: boolean
  toggleSunlightMode: () => void
  setSunlightMode: (enabled: boolean) => void
}

const SunlightModeContext = createContext<SunlightModeContextValue | null>(null)

export function SunlightModeProvider({ children }: { children: ReactNode }) {
  const [sunlightMode, setSunlightModeState] = useState(readSunlightMode)

  const setSunlightMode = useCallback((enabled: boolean) => {
    persistSunlightMode(enabled)
    setSunlightModeState(enabled)
  }, [])

  const toggleSunlightMode = useCallback(() => {
    setSunlightMode(!readSunlightMode())
  }, [setSunlightMode])

  const value = useMemo(
    () => ({ sunlightMode, toggleSunlightMode, setSunlightMode }),
    [sunlightMode, toggleSunlightMode, setSunlightMode],
  )

  return <SunlightModeContext.Provider value={value}>{children}</SunlightModeContext.Provider>
}

export function useSunlightMode() {
  const context = useContext(SunlightModeContext)
  if (!context) {
    throw new Error('useSunlightMode must be used within SunlightModeProvider')
  }
  return context
}
