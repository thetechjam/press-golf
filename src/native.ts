import { logStorageFailure, setBackend, snapshotBackend } from './kv';
import { ROUNDS_KEY, COURSES_KEY, SETTINGS_KEY, ALIASES_KEY, DISTINCT_KEY } from './storage';
import { QUEUE_KEY } from './feedback';

/**
 * Storage that survives inside the native shell.
 *
 * `localStorage` is transient in a WKWebView — iOS reclaims it when the device
 * runs short of space — so an App Store build has to keep its rounds somewhere
 * the system will not take back. Capacitor's Preferences plugin is that place
 * (`UserDefaults` underneath), and this is the twenty lines that point Press at
 * it.
 *
 * Nothing here is imported from npm. Capacitor injects a bridge onto the window
 * of the web view it hosts, and reading the plugin off that bridge is what
 * keeps this path out of the web bundle entirely — the browser build ships
 * not one byte of it, because `isNative()` is false and the bridge is not
 * there. `@capacitor/preferences` is not a dependency of this repo. A native
 * shell would add the package to its own project so the Swift half is compiled
 * in; this file only talks to the bridge that shell would inject.
 *
 * On the web this module does nothing at all and `initNativeStorage` says so by
 * returning false, which is what `main.tsx` does with it.
 */

/** What Press uses of the Preferences plugin. Its full surface is larger. */
interface PreferencesPlugin {
  get(options: { key: string }): Promise<{ value: string | null }>;
  set(options: { key: string; value: string }): Promise<void>;
  remove(options: { key: string }): Promise<void>;
}

interface CapacitorBridge {
  isNativePlatform?: () => boolean;
  Plugins?: { Preferences?: PreferencesPlugin };
}

const bridge = (): CapacitorBridge | undefined =>
  (globalThis as { Capacitor?: CapacitorBridge }).Capacitor;

/** True only inside the iOS or Android shell, never in a browser. */
export const isNative = (): boolean => bridge()?.isNativePlatform?.() === true;

/**
 * Every key that has to come across, because everything Press remembers is one
 * of them. Imported from the modules that own them rather than written out
 * again here: a key added to `storage.ts` and forgotten here would keep working
 * perfectly on the web and quietly stop persisting on a phone, which is the
 * worst shape a bug can have. `native.test.ts` checks this list against what
 * those files actually write.
 */
export const PERSISTED_KEYS = [ROUNDS_KEY, COURSES_KEY, SETTINGS_KEY, ALIASES_KEY, DISTINCT_KEY, QUEUE_KEY] as const;

/**
 * Hydrates from the native store and points the app at it. Awaited once,
 * before the first read — which in `main.tsx` is `getSettings()`, called ahead
 * of render so the palette does not flash.
 *
 * Returns false when there is nothing to do, so the caller cannot accidentally
 * treat a browser as a phone.
 *
 * Named `init` rather than `use` deliberately: `use` is React's reserved
 * prefix, and a function wearing it is a hook as far as the linter is
 * concerned — which this is not, and which made calling it at the top of
 * `main.tsx` an error rather than the point.
 */
export async function initNativeStorage(
  onError?: (key: string, err: unknown) => void
): Promise<boolean> {
  const prefs = bridge()?.Plugins?.Preferences;
  if (!isNative() || !prefs) return false;

  const loaded: Record<string, string> = {};
  for (const key of PERSISTED_KEYS) {
    try {
      const { value } = await prefs.get({ key });
      if (value != null) loaded[key] = value;
    } catch (err) {
      // One unreadable key is not a reason to abandon the other three. It
      // reads as absent, which for every one of them means "nothing saved yet"
      // — the same answer a fresh install gives.
      onError?.(key, err);
    }
  }

  setBackend(
    snapshotBackend(
      loaded,
      (key, value) =>
        // Returned rather than caught here. The promise rejects after this
        // function has gone, and `snapshotBackend` is what attaches the
        // handler — a rejection nobody is waiting on used to vanish.
        value === null ? prefs.remove({ key }) : prefs.set({ key, value }),
      onError
    )
  );
  return true;
}

/**
 * What `main.tsx` passes to `initNativeStorage`.
 *
 * A key that cannot be read at startup, and a write the store later refuses,
 * both arrive here. Logging is the whole of it: there is no screen yet when
 * the first one happens, and the write has already returned to its caller.
 */
export const reportNativeStorageError = logStorageFailure;
