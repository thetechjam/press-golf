import type { Round, SavedCourse } from './types';
import { listRounds, listCourses, writeAll, getAliases, getDistinct } from './storage';
import { mergePeopleData, type PeopleData } from './people';
import { GAMES } from './games';

/**
 * Backup and restore for everything Press keeps on the device.
 *
 * Press stores rounds and favorite courses in localStorage and nowhere else —
 * no account, no server, no copy anywhere but the one browser that wrote them.
 * That is the whole point of the design, and it is also its one unrecoverable
 * failure: clearing site data, switching phones, or reinstalling takes every
 * round with it, silently and permanently. This module is the escape hatch —
 * a file the user owns, holding exactly what the app holds.
 *
 * It is also, incidentally, the only way to move a round between two devices
 * without a backend.
 *
 * Everything here except `restoreBackup` is a pure function of its arguments,
 * so the merge rules can be unit-tested without touching storage.
 */

/**
 * Bumped only when the shape below changes in a way an older reader would get
 * wrong. `parseBackup` refuses a file from the future rather than guessing.
 */
export const BACKUP_FORMAT = 1;

export interface BackupFile {
  /** Marks the file as ours, so a stray JSON file is rejected with a real message. */
  app: 'press';
  format: number;
  /** ISO timestamp, for the UI to show and for the reader to sanity-check. */
  exportedAt: string;
  /** The app version that wrote it — diagnostic only, never load-bearing. */
  appVersion: string;
  rounds: Round[];
  courses: SavedCourse[];
  /**
   * Who is who: spellings merged into one person and pairs answered "two
   * people". Optional, and added without a format bump — a reader that
   * predates it ignores it and loses nothing it knew how to use, and a file
   * that predates it simply has none to restore.
   */
  people?: PeopleData;
}

export function buildBackup(
  rounds: Round[],
  courses: SavedCourse[],
  appVersion: string,
  now: Date = new Date(),
  people?: PeopleData
): BackupFile {
  const file: BackupFile = {
    app: 'press',
    format: BACKUP_FORMAT,
    exportedAt: now.toISOString(),
    appVersion,
    rounds,
    courses,
  };
  if (people && (Object.keys(people.aliases).length || people.distinct.length)) file.people = people;
  return file;
}

/** The phone's people data as it stands, for a backup. */
export const currentPeople = (): PeopleData => ({ aliases: getAliases(), distinct: [...getDistinct()] });

/**
 * The people data in a file, keeping only well-formed entries: a string
 * target for each alias, a two-name key for each answer. Like a damaged
 * round, a damaged entry is dropped rather than costing the rest.
 */
function readPeople(v: unknown): PeopleData | undefined {
  if (!isObject(v)) return undefined;
  const aliases: PeopleData['aliases'] = {};
  if (isObject(v.aliases)) {
    for (const [k, to] of Object.entries(v.aliases)) {
      if (k.trim() && typeof to === 'string' && to.trim()) aliases[k] = to.trim();
    }
  }
  const distinct = Array.isArray(v.distinct)
    ? v.distinct.filter((k): k is string => typeof k === 'string' && /^[^|]+\|[^|]+$/.test(k))
    : [];
  return { aliases, distinct };
}

/** `press-backup-2026-09-11.json` — sorts chronologically in a downloads folder. */
export function backupFilename(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `press-backup-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.json`;
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Read from the game registry rather than written out here, so adding a game
 * can never leave this list behind — and so a round naming a game this build
 * has no engine for is dropped instead of reaching `gameMeta(...).compute` and
 * throwing on the Home screen. That is the right call even though it loses a
 * round: a backup from a newer Press can name a game that does not exist yet.
 */
const GAME_TYPES: readonly string[] = GAMES.map((g) => g.id);

/**
 * The load-bearing shape of a `Round` — the fields every screen and every
 * scoring engine dereferences without checking first.
 *
 * Deliberately not a full structural validation. A backup is written by this
 * same app, so the realistic failure is not a subtly wrong field but a file
 * that is truncated, hand-edited, or not a Press backup at all — and those all
 * fail these checks. Validating every optional field instead would reject
 * rounds written by a future version that added one, which is the opposite of
 * what a backup format should do.
 *
 * A round that fails is dropped rather than repaired: one damaged entry must
 * not cost the user the rest of the file.
 */
function isRound(v: unknown): v is Round {
  if (!isObject(v)) return false;
  if (typeof v.id !== 'string' || !v.id) return false;
  if (typeof v.date !== 'string') return false;
  if (!Array.isArray(v.players) || !Array.isArray(v.holes)) return false;
  if (!Array.isArray(v.games) || !v.games.every((g) => GAME_TYPES.includes(g as string)))
    return false;
  if (!isObject(v.scores) || !isObject(v.options)) return false;
  if (v.status !== 'in_progress' && v.status !== 'finished') return false;
  // Every merge decision below is a comparison of these two. A round missing
  // them would sort unpredictably against the rounds already on the device.
  if (typeof v.updatedAt !== 'number' || typeof v.createdAt !== 'number') return false;
  return v.players.every((p) => isObject(p) && typeof p.id === 'string' && typeof p.name === 'string');
}

function isCourse(v: unknown): v is SavedCourse {
  if (!isObject(v)) return false;
  if (typeof v.id !== 'string' || !v.id) return false;
  if (typeof v.name !== 'string') return false;
  if (!Array.isArray(v.holes)) return false;
  return v.holes.every(
    (h) => isObject(h) && typeof h.number === 'number' && typeof h.par === 'number'
  );
}

export type ParseResult =
  | { ok: true; file: BackupFile; droppedRounds: number; droppedCourses: number }
  | { ok: false; error: string };

/**
 * Reads a backup file's text. Never throws — every failure comes back as a
 * message the sheet can show verbatim.
 */
export function parseBackup(text: string): ParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: "That file isn't valid JSON." };
  }

  if (!isObject(raw) || raw.app !== 'press') {
    return { ok: false, error: "That doesn't look like a Press backup." };
  }

  const format = typeof raw.format === 'number' ? raw.format : 0;
  if (format > BACKUP_FORMAT) {
    return {
      ok: false,
      error: 'That backup was written by a newer version of Press. Update the app and try again.',
    };
  }

  const rawRounds = Array.isArray(raw.rounds) ? raw.rounds : [];
  const rawCourses = Array.isArray(raw.courses) ? raw.courses : [];
  const rounds = rawRounds.filter(isRound);
  const courses = rawCourses.filter(isCourse);
  const people = readPeople(raw.people);

  return {
    ok: true,
    droppedRounds: rawRounds.length - rounds.length,
    droppedCourses: rawCourses.length - courses.length,
    file: {
      app: 'press',
      format,
      exportedAt: typeof raw.exportedAt === 'string' ? raw.exportedAt : '',
      appVersion: typeof raw.appVersion === 'string' ? raw.appVersion : '',
      rounds,
      courses,
      ...(people ? { people } : {}),
    },
  };
}

export interface MergeReport {
  added: number;
  updated: number;
  /** Already present and at least as new here as in the file. */
  kept: number;
}

/**
 * Merges restored rounds into the ones already on this device.
 *
 * A restore adds; it never deletes. The rule on a collision is newest-wins by
 * `updatedAt`, which is what makes restoring safe to do at any time: dropping
 * last week's backup onto a phone that has since played three more holes
 * leaves those holes alone, and restoring the same file twice changes nothing
 * the second time.
 *
 * Ties keep the local copy — with equal timestamps there is no evidence the
 * incoming one is better, and not overwriting is the reversible choice.
 */
export function mergeRounds(
  existing: Round[],
  incoming: Round[]
): { rounds: Round[]; report: MergeReport } {
  const byId = new Map(existing.map((r) => [r.id, r]));
  const report: MergeReport = { added: 0, updated: 0, kept: 0 };

  for (const r of incoming) {
    const mine = byId.get(r.id);
    if (!mine) {
      byId.set(r.id, r);
      report.added += 1;
    } else if (r.updatedAt > mine.updatedAt) {
      byId.set(r.id, r);
      report.updated += 1;
    } else {
      report.kept += 1;
    }
  }

  return { rounds: [...byId.values()], report };
}

/**
 * Merges restored courses, matched by id.
 *
 * A `SavedCourse` carries no timestamp, so there is no way to tell which side
 * of a collision is newer — and an id collision means it is literally the same
 * saved course, edited on one device or the other. Keeping the local copy is
 * the conservative half of that coin: a restore can then never overwrite pars
 * or stroke indexes the user corrected on this phone.
 */
export function mergeCourses(
  existing: SavedCourse[],
  incoming: SavedCourse[]
): { courses: SavedCourse[]; report: MergeReport } {
  const byId = new Map(existing.map((c) => [c.id, c]));
  const report: MergeReport = { added: 0, updated: 0, kept: 0 };

  for (const c of incoming) {
    if (byId.has(c.id)) {
      report.kept += 1;
    } else {
      byId.set(c.id, c);
      report.added += 1;
    }
  }

  return { courses: [...byId.values()], report };
}

export type RestoreResult =
  | {
      ok: true;
      rounds: MergeReport;
      courses: MergeReport;
      dropped: number;
      /** Merged names the file brought that this phone did not have. */
      people: number;
    }
  | { ok: false; error: string };

/**
 * The one function here that touches storage: parse, merge, write.
 *
 * Both stores go through `writeAll`, which rolls back if either write fails,
 * so a restore either applies completely or not at all.
 */
export function restoreBackup(text: string): RestoreResult {
  const parsed = parseBackup(text);
  if (!parsed.ok) return parsed;

  const rounds = mergeRounds(listRounds(), parsed.file.rounds);
  const courses = mergeCourses(listCourses(), parsed.file.courses);
  const people = parsed.file.people
    ? mergePeopleData(currentPeople(), parsed.file.people)
    : { people: undefined, added: 0 };

  try {
    // One write for all of it, so the names merge with the rounds or not at all.
    writeAll(rounds.rounds, courses.courses, people.people);
  } catch {
    return {
      ok: false,
      error: "There wasn't room to save the restored rounds. Delete a few old rounds and try again.",
    };
  }

  return {
    ok: true,
    rounds: rounds.report,
    courses: courses.report,
    dropped: parsed.droppedRounds + parsed.droppedCourses,
    people: people.added,
  };
}
