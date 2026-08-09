import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { StatTrackerScreen } from '@/components/StatTrackerScreen'
import { SunlightModeProvider } from '@/contexts/SunlightModeContext'
import { parseStatTrackerRoute } from '@/lib/stat-tracker'
import { applySunlightMode, readSunlightMode } from '@/lib/sunlight-mode'

applySunlightMode(readSunlightMode())

function Root() {
  const [trackerRoute, setTrackerRoute] = useState(() => parseStatTrackerRoute())

  useEffect(() => {
    const syncRoute = () => setTrackerRoute(parseStatTrackerRoute())
    syncRoute()
    window.addEventListener('hashchange', syncRoute)
    window.addEventListener('popstate', syncRoute)
    return () => {
      window.removeEventListener('hashchange', syncRoute)
      window.removeEventListener('popstate', syncRoute)
    }
  }, [])

  return (
    <SunlightModeProvider>
      {trackerRoute ? (
        <>
          {/* Stat tracker is a standalone mobile view — no main app chrome */}
          <StatTrackerScreen matchId={trackerRoute.matchId} token={trackerRoute.token} />
        </>
      ) : (
        <App />
      )}
    </SunlightModeProvider>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)
