import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { getSettings } from './storage'
import { applyTheme, watchSystemTheme } from './theme'

// Applied before render so there is no flash of the wrong palette.
const settings = getSettings()
applyTheme(settings.theme, settings.glare)
watchSystemTheme()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
