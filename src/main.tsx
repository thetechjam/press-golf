import './index.css'
import { initNativeStorage, reportNativeStorageError } from './native'
import { startApp } from './startup'

// startApp never rejects: a failure before the first render paints an error
// screen rather than leaving the splash over a blank page.
await startApp(document.getElementById('root')!, () =>
  initNativeStorage(reportNativeStorageError),
)
