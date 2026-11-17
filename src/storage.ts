import type { Round, SavedCourse } from './types';
import { kv } from './kv';
import { applyAliases, withAlias, mergeInRounds, pairKey, type Aliases, type PeopleData } from './people';

/**
 * Exported because a native build has to hydrate every one of them before the
 * app reads anything, and a key this module knew about privately would be a
 * key that silently stopped persisting on iOS. `native.ts` composes the list;
 * `native.test.ts` checks it against what this file actually writes.
 */
export const ROUNDS_KEY = 'press.rounds.v1';
export const COURSES_KEY = 'press.courses.v1';
export const SETTINGS_KEY = 'press.settings.v1';
export const ALIASES_KEY = 'press.aliases.v1';
export const DISTINCT_KEY = 'press.distinct.v1';

export type Theme = 'system' | 'light' | 'dark';

export interface Settings {
  /** Hold a screen wake lock while scoring. */
  keepAwake: boolean;
  /** Which palette to paint. 'system' follows the OS appearance. */
  theme: Theme;
  /** Max-contrast light theme for direct sun. Overrides `theme` while on. */
  glare: boolean;
  /** Remembered so a reporter types their name once. '' means not set. */
  reporterName: string;
  /**
   * The prompt after the first finished round — back up, and add Press to the
   * home screen — has been dismissed. Absent in settings written before the
   * prompt existed; `skipKeepPromptIfRoundsExist` fills that in.
   */
  firstFinishPromptDismissed: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  keepAwake: true,
  theme: 'system',
  glare: false,
  reporterName: '',
  firstFinishPromptDismissed: false,
};

const THEMES: readonly string[] = ['system', 'light', 'dark'];
const isTheme = (v: unknown): v is Theme => typeof v === 'string' && THEMES.includes(v);

export function getSettings(): Settings {
  try {
    const raw = kv.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const p = JSON.parse(raw) as Partial<Settings> & { sunlight?: unknown };
    return {
      keepAwake: typeof p.keepAwake === 'boolean' ? p.keepAwake : DEFAULT_SETTINGS.keepAwake,
      theme: isTheme(p.theme) ? p.theme : DEFAULT_SETTINGS.theme,
      // v1 stored this as `sunlight`. Read it across explicitly — a spread over
      // defaults would silently reset an enabled setting to false on upgrade.
      glare: typeof p.glare === 'boolean' ? p.glare : p.sunlight === true,
      reporterName:
        typeof p.reporterName === 'string' ? p.reporterName : DEFAULT_SETTINGS.reporterName,
      firstFinishPromptDismissed:
        typeof p.firstFinishPromptDismissed === 'boolean'
          ? p.firstFinishPromptDismissed
          : DEFAULT_SETTINGS.firstFinishPromptDismissed,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(patch: Partial<Settings>): Settings {
  const cur = getSettings();
  // Field-by-field rather than a spread, so the legacy `sunlight` key is not
  // carried forward into the next write.
  const next: Settings = {
    keepAwake: patch.keepAwake ?? cur.keepAwake,
    theme: patch.theme ?? cur.theme,
    glare: patch.glare ?? cur.glare,
    reporterName: patch.reporterName ?? cur.reporterName,
    firstFinishPromptDismissed: patch.firstFinishPromptDismissed ?? cur.firstFinishPromptDismissed,
  };
  kv.setItem(SETTINGS_KEY, JSON.stringify(next));
  return next;
}

/**
 * The keep-your-rounds prompt is for the first round finished after it
 * existed. A phone that already has a finished round has had that moment;
 * marking the prompt dismissed here, once, is what stops an update from
 * asking on the next launch. A phone with no finished round is left alone.
 *
 * Read from what was stored, not from `getSettings`. That fills a default,
 * and treating the default as a decision would dismiss the prompt for a
 * brand-new phone the moment any setting was saved.
 */
export function skipKeepPromptIfRoundsExist(): void {
  let stored: unknown = null;
  try {
    const raw = kv.getItem(SETTINGS_KEY);
    stored = raw ? JSON.parse(raw) : null;
  } catch {
    return;
  }
  if (
    stored &&
    typeof stored === 'object' &&
    typeof (stored as { firstFinishPromptDismissed?: unknown }).firstFinishPromptDismissed ===
      'boolean'
  ) {
    return;
  }
  if (listRounds().some((r) => r.status === 'finished')) {
    saveSettings({ firstFinishPromptDismissed: true });
  }
}

export function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

export function listRounds(): Round[] {
  try {
    const raw = kv.getItem(ROUNDS_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // One entry that is not a round (a null from a bad write, say) used to
    // pass this parse and throw on the Home screen, taking every round down
    // with it. It is left out; the rest are still the user's rounds.
    const rounds = parsed.filter(
      (r): r is Round => !!r && typeof r === 'object' && typeof (r as Round).id === 'string'
    );
    // Newest day played first; the round touched last breaks a tie. A list
    // that read Jun 4 above Jun 7 because the earlier one had been edited
    // since was ordered by something the reader could not see.
    return rounds.sort(
      (a, b) => String(b.date ?? '').localeCompare(String(a.date ?? '')) || b.updatedAt - a.updatedAt
    );
  } catch {
    return [];
  }
}

export function getRound(id: string): Round | undefined {
  return listRounds().find((r) => r.id === id);
}

/** Spellings the user has merged into one person: old spelling's key → name. */
export function getAliases(): Aliases {
  try {
    const raw = kv.getItem(ALIASES_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : {};
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: Aliases = {};
    for (const [k, v] of Object.entries(parsed)) if (typeof v === 'string' && v.trim()) out[k] = v;
    return out;
  } catch {
    return {};
  }
}

/** Pairs of names the user has said are two people, so they are not asked about again. */
export function getDistinct(): Set<string> {
  try {
    const parsed = JSON.parse(kv.getItem(DISTINCT_KEY) ?? '[]') as unknown;
    return new Set(Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string') : []);
  } catch {
    return new Set();
  }
}

export function markDistinct(a: string, b: string): void {
  const set = getDistinct();
  set.add(pairKey(a, b));
  kv.setItem(DISTINCT_KEY, JSON.stringify([...set]));
}

/**
 * Makes `from` the same person as `into`: every saved round is rewritten to
 * the one spelling, and the alias is kept so a round that arrives later with
 * the old one — typed, shared, restored — is brought into line as it saves.
 */
export function mergePeople(from: string, into: string): void {
  kv.setItem(ALIASES_KEY, JSON.stringify(withAlias(getAliases(), from, into)));
  const before = listRounds();
  const after = mergeInRounds(before, from, into);
  const now = Date.now();
  // A changed round counts as changed, so a restore's newest-wins merge keeps
  // the merged spelling over an older backup's.
  const stamped = after.map((r, i) => (r === before[i] ? r : { ...r, updatedAt: now }));
  kv.setItem(ROUNDS_KEY, JSON.stringify(stamped));
}

/**
 * Writes a round. False when the write failed — storage full, or a browser
 * mode that refuses writes — which used to throw out of the score handler
 * after the screen had already updated: scoring looked normal and nothing
 * was kept. The caller says so; this does not, because it is also called
 * from places that have nowhere to say it.
 */
export function saveRound(round: Round): boolean {
  const rounds = listRounds().filter((r) => r.id !== round.id);
  rounds.push({ ...applyAliases(round, getAliases()), updatedAt: Date.now() });
  try {
    kv.setItem(ROUNDS_KEY, JSON.stringify(rounds));
    return true;
  } catch {
    return false;
  }
}

export function deleteRound(id: string): void {
  const rounds = listRounds().filter((r) => r.id !== id);
  kv.setItem(ROUNDS_KEY, JSON.stringify(rounds));
}

export function listCourses(): SavedCourse[] {
  try {
    const raw = kv.getItem(COURSES_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // As listRounds: one bad entry must not empty the list, and a course
    // whose name is not a string must not throw inside the sort and do the
    // same.
    return parsed
      .filter((c): c is SavedCourse => !!c && typeof c === 'object' && typeof (c as SavedCourse).id === 'string')
      .sort((a, b) => String(a.name ?? '').localeCompare(String(b.name ?? '')));
  } catch {
    return [];
  }
}

/**
 * Upserts a course (matched by id). False when the write failed.
 *
 * The realistic failure is `QuotaExceededError`, the same one `writeAll`
 * catches and rolls back: a full phone used to throw out of the button that
 * asked, so the screen never got to say the course was not kept. The previous
 * list is untouched — the write never landed — and the caller says so.
 */
export function saveCourse(course: SavedCourse): boolean {
  const courses = listCourses().filter((c) => c.id !== course.id);
  courses.push(course);
  try {
    kv.setItem(COURSES_KEY, JSON.stringify(courses));
    return true;
  } catch {
    return false;
  }
}

export function deleteCourse(id: string): void {
  const courses = listCourses().filter((c) => c.id !== id);
  kv.setItem(COURSES_KEY, JSON.stringify(courses));
}

/**
 * Bulk write of both stores at once, used by restore.
 *
 * Restoring writes two keys that have to agree — a round can name a course
 * that only the courses key holds — and the realistic way a write fails here
 * is `QuotaExceededError` on a large file, which would otherwise land the
 * first key and reject the second. So both previous values are captured and
 * put back if either write throws, leaving storage exactly as it was and
 * letting the caller report one clean failure. The rollback writes only
 * shrink what is stored, so they cannot fail for the same reason.
 *
 * Re-throws so the caller can tell a failed restore from a successful one.
 */
export function writeAll(rounds: Round[], courses: SavedCourse[], people?: PeopleData): void {
  const prevRounds = kv.getItem(ROUNDS_KEY);
  const prevCourses = kv.getItem(COURSES_KEY);
  const prevAliases = kv.getItem(ALIASES_KEY);
  const prevDistinct = kv.getItem(DISTINCT_KEY);
  const restore = (key: string, prev: string | null) =>
    prev === null ? kv.removeItem(key) : kv.setItem(key, prev);
  try {
    // Names from the people data being written, not the old: a merge made on
    // the other phone renames this phone's rounds too.
    const aliases = people?.aliases ?? getAliases();
    if (people) {
      kv.setItem(ALIASES_KEY, JSON.stringify(people.aliases));
      kv.setItem(DISTINCT_KEY, JSON.stringify(people.distinct));
    }
    kv.setItem(ROUNDS_KEY, JSON.stringify(rounds.map((r) => applyAliases(r, aliases))));
    kv.setItem(COURSES_KEY, JSON.stringify(courses));
  } catch (err) {
    restore(ROUNDS_KEY, prevRounds);
    restore(COURSES_KEY, prevCourses);
    restore(ALIASES_KEY, prevAliases);
    restore(DISTINCT_KEY, prevDistinct);
    throw err;
  }
}
