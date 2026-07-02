import type { Round, SavedCourse } from './types';

const KEY = 'press.rounds.v1';
const COURSES_KEY = 'press.courses.v1';
const SETTINGS_KEY = 'press.settings.v1';

export interface Settings {
  /** Hold a screen wake lock while scoring. */
  keepAwake: boolean;
}

export const DEFAULT_SETTINGS: Settings = { keepAwake: true };

export function getSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    // Merge over defaults so settings added later read as their default.
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<Settings>) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(patch: Partial<Settings>): Settings {
  const next = { ...getSettings(), ...patch };
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
