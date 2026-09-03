import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/bebas-neue/latin-400.css'
import './index.css'
import { AuthScreen } from '@/components/AuthScreen'
import { LandingPage } from '@/components/LandingPage'
import { PendingAccessScreen } from '@/components/PendingAccessScreen'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { PwaUpdateToast } from '@/components/PwaUpdateToast'
import { ScreenSuspense } from '@/components/Spinner'
import { AuthProvider, useAuth } from '@/contexts/AuthContext'
import { SunlightModeProvider } from '@/contexts/SunlightModeContext'
import { isLandingPath } from '@/lib/app-routes'
import { APP_DOCUMENT_TITLE } from '@/lib/branding'
import { lazyWithChunkReload } from '@/lib/lazy-import'
import { initSentry } from '@/lib/sentry'
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

const App = lazyWithChunkReload(() => import('./App.tsx'))
const ParentHubScreen = lazyWithChunkReload(() =>
  import('@/components/ParentHubScreen').then((m) => ({ default: m.ParentHubScreen })),
)
const StatTrackerScreen = lazyWithChunkReload(() =>
  import('@/components/StatTrackerScreen').then((m) => ({ default: m.StatTrackerScreen })),
)

initSentry()

applySunlightMode(readSunlightMode())
// Must run before Auth mounts — captured PWA links may land on / with target in launchQueue.
installParentHubLaunchConsumer()

// Drop legacy root-scoped SW before first paint so coaches don't load a cached broken shell.
if (!parseStatTrackerRoute() && !parseParentHubRoute()) {
  void unregisterRootScopedParentServiceWorker()
}

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

  useEffect(() => {
    document.title = APP_DOCUMENT_TITLE
  }, [])

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

  return (
    <ScreenSuspense>
      <App />
    </ScreenSuspense>
  )
}

function Root() {
  const [trackerRoute, setTrackerRoute] = useState(() => parseStatTrackerRoute())
  const [parentHubRoute, setParentHubRoute] = useState(() => bootstrapParentHubRoute())
  const [landingRoute, setLandingRoute] = useState(() => isLandingPath(window.location.pathname))

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
      setLandingRoute(isLandingPath(window.location.pathname))
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
      <PwaUpdateToast />
      {trackerRoute ? (
        <ScreenSuspense>
          <StatTrackerScreen matchId={trackerRoute.matchId} token={trackerRoute.token} />
        </ScreenSuspense>
      ) : parentHubRoute ? (
        <ErrorBoundary
          sectionLabel="Parent Hub"
          resetKey={
            parentHubRoute.kind === 'slug' ? parentHubRoute.slug : parentHubRoute.teamId
          }
          className="min-h-dvh bg-background"
        >
          <ScreenSuspense>
            <ParentHubScreen route={parentHubRoute} />
          </ScreenSuspense>
        </ErrorBoundary>
      ) : landingRoute ? (
        <LandingPage />
      ) : (
        <AuthProvider>
          <ErrorBoundary sectionLabel="Staff app" className="min-h-dvh bg-background">
            <AuthenticatedApp />
          </ErrorBoundary>
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
