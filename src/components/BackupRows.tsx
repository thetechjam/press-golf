import { useRef, useState } from 'react';
import { listRounds, listCourses } from '../storage';
import { offerBackup, restoreBackup, type MergeReport } from '../backup';

/**
 * The Settings sheet's "Your rounds" block: write a backup file, or merge one
 * back in.
 *
 * Lives in its own file rather than inline in SettingsSheet because it is the
 * only row group there that owns async work and a status line — everything
 * else in that sheet is a switch over a single setting.
 */

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** "Added 3 rounds, updated 1 · 2 already up to date" — only the parts that happened. */
function describe(rounds: MergeReport, courses: MergeReport, dropped: number, people = 0): string {
  const changes: string[] = [];
  if (rounds.added) changes.push(`added ${plural(rounds.added, 'round')}`);
  if (rounds.updated) changes.push(`updated ${plural(rounds.updated, 'round')}`);
  if (courses.added) changes.push(`added ${plural(courses.added, 'course')}`);
  if (people) changes.push(`matched ${plural(people, 'merged name')}`);

  const untouched = rounds.kept + courses.kept;
  const parts: string[] = [];
  // Capitalized by the caller's sentence position, so build it in lower case
  // and fix the first letter once at the end.
  parts.push(changes.length ? changes.join(', ') : 'nothing new to add');
  if (untouched) parts.push(`${plural(untouched, 'item')} already up to date`);
  if (dropped) parts.push(`${plural(dropped, 'entry', 'entries')} in the file couldn't be read`);

  const s = parts.join(' · ');
  return s.charAt(0).toUpperCase() + s.slice(1) + '.';
}

export function BackupRows({ onRestored }: { onRestored?: () => void } = {}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const counts = { rounds: listRounds().length, courses: listCourses().length };

  const say = (msg: string, isError = false) => {
    setStatus(msg);
    setFailed(isError);
  };

  const exportBackup = async () => {
    const result = await offerBackup();
    if (!result.ok) {
      if (result.aborted) return;
      say("That backup couldn't be saved.", true);
      return;
    }
    say(`Backed up ${plural(counts.rounds, 'round')} and ${plural(counts.courses, 'course')}.`);
  };

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files?.[0];
    // Clear immediately: without this, picking the same file twice in a row
    // fires no change event the second time and the row looks dead.
    e.target.value = '';
    if (!picked) return;

    let text: string;
    try {
      text = await picked.text();
    } catch {
      say("That file couldn't be read.", true);
      return;
    }

    const result = restoreBackup(text);
    if (!result.ok) {
      say(result.error, true);
      return;
    }
    say(describe(result.rounds, result.courses, result.dropped, result.people));
    onRestored?.();
  };

  return (
    <>
      <button className="set-row set-action" onClick={exportBackup}>
        <span>
          <span className="set-label">Back up your rounds</span>
          <span className="set-hint">
            {counts.rounds === 0
              ? 'Nothing saved on this device yet'
              : `Save ${plural(counts.rounds, 'round')} and ${plural(
                  counts.courses,
                  'course'
                )} to a file`}
          </span>
        </span>
        <span aria-hidden="true">›</span>
      </button>

      <button className="set-row set-action" onClick={() => fileRef.current?.click()}>
        <span>
          <span className="set-label">Restore from a backup</span>
          <span className="set-hint">Merges into this device — nothing is deleted</span>
        </span>
        <span aria-hidden="true">›</span>
      </button>
      {/* Hidden because the button above is the control. The input is only the
          mechanism that opens the picker, so it never needs to take focus. */}
      <input ref={fileRef} type="file" accept="application/json,.json" onChange={onPick} hidden />

      {status && (
        <p className={`fb-status${failed ? ' bad' : ''}`} role="status">
          {status}
        </p>
      )}
    </>
  );
}
