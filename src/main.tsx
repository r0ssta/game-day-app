import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/bebas-neue/latin-400.css'
import './index.css'
import App from './App.tsx'
import { installDisableShakeUndo } from '@/lib/disable-shake-undo'
import { initSentry } from '@/lib/sentry'

initSentry()
installDisableShakeUndo()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
