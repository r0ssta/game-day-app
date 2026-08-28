import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { AuthScreen } from '@/components/AuthScreen'
import { PendingAccessScreen } from '@/components/PendingAccessScreen'
import { ParentHubScreen } from '@/components/ParentHubScreen'
import { StatTrackerScreen } from '@/components/StatTrackerScreen'
import { AuthProvider, useAuth } from '@/contexts/AuthContext'
import { SunlightModeProvider } from '@/contexts/SunlightModeContext'
import {
  parseParentHubRoute,
  registerParentServiceWorker,
  restoreStandaloneParentHubPath,
} from '@/lib/parent-hub'
import { parseStatTrackerRoute } from '@/lib/stat-tracker'
import { applySunlightMode, readSunlightMode } from '@/lib/sunlight-mode'

applySunlightMode(readSunlightMode())

function AuthenticatedApp() {
  const { loading, isAuthenticated, isActiveStaff } = useAuth()

  if (loading) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-background px-4">
        <p className="text-sm font-semibold text-muted-foreground">Checking session…</p>
      </main>
    )
  }

  if (!isAuthenticated) {
    return <AuthScreen />
  }

  if (!isActiveStaff) {
    return <PendingAccessScreen />
  }

  return <App />
}

function Root() {
  const [trackerRoute, setTrackerRoute] = useState(() => parseStatTrackerRoute())
  const [parentHubRoute, setParentHubRoute] = useState(() => {
    // Home Screen apps must stay on the public hub even when a coach session exists.
    restoreStandaloneParentHubPath()
    return parseParentHubRoute()
  })

  useEffect(() => {
    void registerParentServiceWorker()
  }, [])

  useEffect(() => {
    const syncRoute = () => {
      restoreStandaloneParentHubPath()
      setTrackerRoute(parseStatTrackerRoute())
      setParentHubRoute(parseParentHubRoute())
    }
    syncRoute()
    window.addEventListener('hashchange', syncRoute)
    window.addEventListener('popstate', syncRoute)
    return () => {
      window.removeEventListener('hashchange', syncRoute)
      window.removeEventListener('popstate', syncRoute)
    }
  }, [])

  // Public Parent Hub bypasses AuthProvider entirely — logged-in coaches still see the hub.
  return (
    <SunlightModeProvider>
      {trackerRoute ? (
        <StatTrackerScreen matchId={trackerRoute.matchId} token={trackerRoute.token} />
      ) : parentHubRoute ? (
        <ParentHubScreen route={parentHubRoute} />
      ) : (
        <AuthProvider>
          <AuthenticatedApp />
        </AuthProvider>
      )}
    </SunlightModeProvider>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)
