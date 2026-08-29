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
  installParentHubLaunchConsumer,
  parseParentHubRoute,
  registerParentServiceWorker,
  restoreStandaloneParentHubPath,
  unregisterRootScopedParentServiceWorker,
} from '@/lib/parent-hub'
import {
  applyParentHubManifestLink,
  rememberParentHubSlug,
} from '@/lib/parent-hub-pwa'
import { parseStatTrackerRoute } from '@/lib/stat-tracker'
import { applySunlightMode, readSunlightMode } from '@/lib/sunlight-mode'

applySunlightMode(readSunlightMode())
// Must run before Auth mounts — captured PWA links may land on / with target in launchQueue.
installParentHubLaunchConsumer()

/** Resolve hub route before React mounts so we never flash Staff Login. */
function bootstrapParentHubRoute() {
  restoreStandaloneParentHubPath()
  const route = parseParentHubRoute()
  if (route?.kind === 'slug') {
    applyParentHubManifestLink(route.slug)
    rememberParentHubSlug(route.slug)
  }
  return route
}

function AuthenticatedApp() {
  const { loading, accessLoading, isAuthenticated, isActiveStaff } = useAuth()

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

  // Signed-in coaches should reach the app quickly — don't block kickoff on role RPCs.
  if (!accessLoading && !isActiveStaff) {
    return <PendingAccessScreen />
  }

  return <App />
}

function Root() {
  const [trackerRoute, setTrackerRoute] = useState(() => parseStatTrackerRoute())
  const [parentHubRoute, setParentHubRoute] = useState(() => bootstrapParentHubRoute())

  useEffect(() => {
    if (parentHubRoute) {
      void registerParentServiceWorker()
    } else {
      void unregisterRootScopedParentServiceWorker()
    }
  }, [parentHubRoute])

  useEffect(() => {
    const syncRoute = () => {
      const nextHub = bootstrapParentHubRoute()
      setTrackerRoute(parseStatTrackerRoute())
      setParentHubRoute(nextHub)
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
