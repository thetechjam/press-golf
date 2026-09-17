import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { getSettings } from './storage'
import { applyTheme, watchSystemTheme } from './theme'
import { flushQueue, postFeedback, watchConnectivity } from './feedback'
import { useNativeStorage } from './native'

// Inside the native shell, storage has to be hydrated before anything reads
// it — and the first read is two lines down. On the web this resolves
// immediately having done nothing, so the browser path is unchanged.
await useNativeStorage()

// Applied before render so there is no flash of the wrong palette.
const settings = getSettings()
applyTheme(settings.theme, settings.glare)
watchSystemTheme()

// Retry anything written while offline. Fire-and-forget — a failure just
// leaves the entry queued for the next attempt.
void flushQueue(postFeedback)
watchConnectivity(postFeedback)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
