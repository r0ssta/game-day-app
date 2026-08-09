import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { StatTrackerScreen } from '@/components/StatTrackerScreen'
import { parseStatTrackerRoute } from '@/lib/stat-tracker'

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

  if (trackerRoute) {
    return (
      <StatTrackerScreen matchId={trackerRoute.matchId} token={trackerRoute.token} />
    )
  }

  return <App />
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)
