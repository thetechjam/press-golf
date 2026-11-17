import { kv } from './kv';

/**
 * Names these keys had when the app was called Press.
 *
 * A launch copies each one onto its `trunk.*` name when that name is empty,
 * then deletes the old one. New writes never use the old names. Both have to
 * keep working: the data under them is every round somebody has already played.
 *
 * The current names live with the modules that write them (`storage.ts`,
 * `feedback.ts`). This map is the only place the old spellings are written
 * down, and `native.test.ts` checks that it covers every key those modules own.
 */
export const LEGACY_KEY_FOR: Record<string, string> = {
  'trunk.rounds.v1': 'press.rounds.v1',
  'trunk.courses.v1': 'press.courses.v1',
  'trunk.settings.v1': 'press.settings.v1',
  'trunk.aliases.v1': 'press.aliases.v1',
  'trunk.distinct.v1': 'press.distinct.v1',
  'trunk.feedback.queue.v1': 'press.feedback.queue.v1',
};

export const LEGACY_KEYS = Object.values(LEGACY_KEY_FOR);

export interface MigrationPlan {
  /** What this launch should read. Old keys are absent. */
  record: Record<string, string>;
  /** New keys to write before the old key is deleted. */
  copies: { key: string; value: string; drop: string }[];
  /** Old keys to delete because the new key already held a value. */
  drops: string[];
}

/**
 * Pure. `copies` are the moves that must land on disk before `drop` is
 * removed; `drops` are old keys that are safe to remove immediately because
 * the new key was already there. A failed copy must not be followed by its
 * removal — the caller decides that, so a store that refuses the write leaves
 * the old key for the next launch.
 */
export function migratedRecord(loaded: Record<string, string>): MigrationPlan {
  const legacy = new Set(LEGACY_KEYS);
  const record: Record<string, string> = {};
  for (const [key, value] of Object.entries(loaded)) {
    if (!legacy.has(key)) record[key] = value;
  }

  const copies: MigrationPlan['copies'] = [];
  const drops: string[] = [];
  for (const [newKey, oldKey] of Object.entries(LEGACY_KEY_FOR)) {
    const oldVal = loaded[oldKey];
    if (oldVal == null) continue;
    if (record[newKey] == null) {
      record[newKey] = oldVal;
      copies.push({ key: newKey, value: oldVal, drop: oldKey });
    } else {
      drops.push(oldKey);
    }
  }
  return { record, copies, drops };
}

/**
 * Web path. Called once from `main.tsx` before anything reads. Inside the
 * native shell the same plan runs in `initNativeStorage`, against the store
 * that actually survives there — running it here as well would migrate the
 * transient `localStorage` and leave the real one behind.
 *
 * A write that throws stops the rest. Keys already copied stay copied; their
 * old names are removed on the next launch, when the new name is the one that
 * exists. The key that failed is still under its old name, so nothing is lost.
 */
export function migrateLegacyKeys(): void {
  const loaded: Record<string, string> = {};
  try {
    for (const key of [...Object.keys(LEGACY_KEY_FOR), ...LEGACY_KEYS]) {
      const value = kv.getItem(key);
      if (value != null) loaded[key] = value;
    }
  } catch {
    return;
  }

  const { copies, drops } = migratedRecord(loaded);
  for (const copy of copies) {
    try {
      kv.setItem(copy.key, copy.value);
    } catch {
      return;
    }
  }
  for (const copy of copies) {
    try {
      kv.removeItem(copy.drop);
    } catch {
      // The new key is already written. The old one is a spare copy.
    }
  }
  for (const key of drops) {
    try {
      kv.removeItem(key);
    } catch {
      // The new key was already there.
    }
  }
}
