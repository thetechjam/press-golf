import { setBackend, snapshotBackend } from './kv';
import { ROUNDS_KEY, COURSES_KEY, SETTINGS_KEY, ALIASES_KEY, DISTINCT_KEY } from './storage';
import { QUEUE_KEY } from './feedback';
import { LEGACY_KEYS, migratedRecord } from './legacyKeys';

/**
 * Storage that survives inside the native shell.
 *
 * `localStorage` is transient in a WKWebView — iOS reclaims it when the device
 * runs short of space — so an App Store build has to keep its rounds somewhere
 * the system will not take back. Capacitor's Preferences plugin is that place
 * (`UserDefaults` underneath), and this is the twenty lines that point Trunk at
 * it.
 *
 * Nothing here is imported from npm. Capacitor injects a bridge onto the window
 * of the web view it hosts, and reading the plugin off that bridge is what
 * keeps `@capacitor/preferences` out of the web bundle entirely — the browser
 * build ships not one byte of this path, because `isNative()` is false and the
 * bridge is not there. The package is still installed for the native build:
 * that is how its Swift half gets compiled in. It is simply never imported.
 *
 * On the web this module does nothing at all and `initNativeStorage` says so by
 * returning false, which is what `main.tsx` does with it.
 */

/** What Trunk uses of the Preferences plugin. Its full surface is larger. */
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
 * Every key that has to come across, because everything Trunk remembers is one
 * of them. Imported from the modules that own them rather than written out
 * again here: a key added to `storage.ts` and forgotten here would keep working
 * perfectly on the web and quietly stop persisting on a phone, which is the
 * worst shape a bug can have. `native.test.ts` checks this list against what
 * those files actually write.
 */
export const PERSISTED_KEYS = [ROUNDS_KEY, COURSES_KEY, SETTINGS_KEY, ALIASES_KEY, DISTINCT_KEY, QUEUE_KEY] as const;

/**
 * What a launch reads. The current keys, then the names they had when the app
 * was called Press. A value found only under an old name is copied across
 * before the snapshot is installed, so the first read already sees it.
 */
export const HYDRATE_KEYS = [...PERSISTED_KEYS, ...LEGACY_KEYS];

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
  for (const key of HYDRATE_KEYS) {
    try {
      const { value } = await prefs.get({ key });
      if (value != null) loaded[key] = value;
    } catch (err) {
      // One unreadable key is not a reason to abandon the others. It
      // reads as absent, which for every one of them means "nothing saved yet"
      // — the same answer a fresh install gives.
      onError?.(key, err);
    }
  }

  // Copy off the old names before anything reads. A copy that the store
  // refuses stays in memory for this launch and on the old key on disk, so
  // the next launch tries again. The old key is removed only after the new
  // one has been written.
  const { record, copies, drops } = migratedRecord(loaded);
  for (const copy of copies) {
    try {
      await prefs.set({ key: copy.key, value: copy.value });
      await prefs.remove({ key: copy.drop });
    } catch (err) {
      onError?.(copy.key, err);
    }
  }
  for (const key of drops) {
    try {
      await prefs.remove({ key });
    } catch (err) {
      onError?.(key, err);
    }
  }

  setBackend(
    snapshotBackend(
      record,
      (key, value) => {
        // A rejected promise is not a thrown error, so snapshotBackend's own
        // catch cannot see this one. Caught here instead, and reported through
        // the same hook, so a store that has started refusing writes surfaces
        // the same way whichever kind of failure it is.
        const done = value === null ? prefs.remove({ key }) : prefs.set({ key, value });
        void done.catch((err) => onError?.(key, err));
      },
      onError
    )
  );
  return true;
}
