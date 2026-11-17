import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { getSettings } from './storage'
import { applyTheme, watchSystemTheme } from './theme'
import { flushQueue, postFeedback, watchConnectivity } from './feedback'
import { migrateLegacyKeys } from './legacyKeys'
import { initNativeStorage, isNative } from './native'
import { requestPersistentStorage } from './persistence'
import { ErrorBoundary } from './components/ErrorBoundary'

// Inside the native shell, storage has to be hydrated before anything reads
// it — and the first read is two lines down. That path also copies keys
// saved when the app was called Press. On the web `initNativeStorage`
// resolves immediately having done nothing, and the copy runs here instead,
// against localStorage, before `getSettings()`.
await initNativeStorage()
if (!isNative()) migrateLegacyKeys()

// Applied before render so there is no flash of the wrong palette.
const settings = getSettings()
applyTheme(settings.theme, settings.glare)
watchSystemTheme()

// Retry anything written while offline. Fire-and-forget — a failure just
// leaves the entry queued for the next attempt.
void flushQueue(postFeedback)
watchConnectivity(postFeedback)

// Ask the browser to keep this origin's storage. Advisory and asynchronous:
// the answer only feeds the diagnostics line in Settings. The native shell
// has its own storage (native.ts) and no eviction to ask about.
if (!isNative()) void requestPersistentStorage()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
