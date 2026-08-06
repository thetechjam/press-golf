import type { Round, SavedCourse } from './types';

const KEY = 'press.rounds.v1';
const COURSES_KEY = 'press.courses.v1';
const SETTINGS_KEY = 'press.settings.v1';

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
}

export const DEFAULT_SETTINGS: Settings = {
  keepAwake: true,
  theme: 'system',
  glare: false,
  reporterName: '',
};

const THEMES: readonly string[] = ['system', 'light', 'dark'];
const isTheme = (v: unknown): v is Theme => typeof v === 'string' && THEMES.includes(v);

export function getSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
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
  };
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
  return next;
}

export function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

export function listRounds(): Round[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const rounds = JSON.parse(raw) as Round[];
    return rounds.sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    return [];
  }
}

export function getRound(id: string): Round | undefined {
  return listRounds().find((r) => r.id === id);
}

export function saveRound(round: Round): void {
  const rounds = listRounds().filter((r) => r.id !== round.id);
  rounds.push({ ...round, updatedAt: Date.now() });
  localStorage.setItem(KEY, JSON.stringify(rounds));
}

export function deleteRound(id: string): void {
  const rounds = listRounds().filter((r) => r.id !== id);
  localStorage.setItem(KEY, JSON.stringify(rounds));
}

export function listCourses(): SavedCourse[] {
  try {
    const raw = localStorage.getItem(COURSES_KEY);
    if (!raw) return [];
    return (JSON.parse(raw) as SavedCourse[]).sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return [];
  }
}

/** Upserts a course (matched by id). */
export function saveCourse(course: SavedCourse): void {
  const courses = listCourses().filter((c) => c.id !== course.id);
  courses.push(course);
  localStorage.setItem(COURSES_KEY, JSON.stringify(courses));
}

export function deleteCourse(id: string): void {
  const courses = listCourses().filter((c) => c.id !== id);
  localStorage.setItem(COURSES_KEY, JSON.stringify(courses));
}
