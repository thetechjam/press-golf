import { StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import App from './App.tsx';
import { getSettings, skipKeepPromptIfRoundsExist } from './storage';
import { applyTheme, watchSystemTheme } from './theme';
import { flushQueue, postFeedback, watchConnectivity } from './feedback';
import { isNative } from './native';
import { requestPersistentStorage } from './persistence';
import { ErrorBoundary } from './components/ErrorBoundary';
import { StartupError } from './components/StartupError';

/**
 * What `main.tsx` does, as a function a test can call.
 *
 * Everything here runs before the first render, which is outside the
 * `ErrorBoundary`: a throw used to reject the top-level `await` in `main.tsx`
 * and leave a splash screen over a blank page, with no way to reach a backup.
 * Now any failure before render paints `StartupError` instead. Returns the
 * root so a test can unmount it.
 *
 * `init` is the native storage hydration. If it fails, the app is not
 * rendered at all: it would read the browser's own store instead of the
 * phone's, show no rounds, and write new ones where iOS can delete them.
 */
export async function startApp(
  container: HTMLElement,
  init: () => Promise<unknown>
): Promise<Root> {
  const root = createRoot(container);
  try {
    // Inside the native shell, storage has to be hydrated before anything
    // reads it. On the web this resolves immediately having done nothing.
    await init();

    // Before the first paint, so a phone that already finished a round before
    // this prompt existed does not see it flash and then vanish.
    skipKeepPromptIfRoundsExist();

    // Applied before render so there is no flash of the wrong palette.
    const settings = getSettings();
    applyTheme(settings.theme, settings.glare);
    watchSystemTheme();

    // Retry anything written while offline. Fire-and-forget — a failure just
    // leaves the entry queued for the next attempt, and on a full phone the
    // queue write itself can be refused; neither is worth an unhandled
    // rejection.
    void flushQueue(postFeedback).catch(() => {});
    watchConnectivity(postFeedback);

    // Ask the browser to keep this origin's storage. Advisory and
    // asynchronous: the answer only feeds the diagnostics line in Settings.
    // The native shell has its own storage (native.ts) and no eviction to ask
    // about.
    if (!isNative()) void requestPersistentStorage();
  } catch (err) {
    console.error('Trunk could not start.', err);
    root.render(<StartupError error={err} />);
    return root;
  }

  root.render(
    <StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </StrictMode>
  );
  return root;
}
