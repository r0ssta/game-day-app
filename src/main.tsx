import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { AuthScreen } from '@/components/AuthScreen'
import { PendingAccessScreen } from '@/components/PendingAccessScreen'
import { StatTrackerScreen } from '@/components/StatTrackerScreen'
import { AuthProvider, useAuth } from '@/contexts/AuthContext'
import { SunlightModeProvider } from '@/contexts/SunlightModeContext'
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
        <StatTrackerScreen matchId={trackerRoute.matchId} token={trackerRoute.token} />
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
