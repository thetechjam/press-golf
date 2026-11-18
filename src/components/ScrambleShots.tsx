import { useState } from 'react';
import type { Hole, Round } from '../types';
import {
  driveStatus,
  memberShort,
  shotLabel,
  shotRows,
  shotsOnHole,
  teamOf,
  teamShotStats,
} from '../games/scramble';
import { buzz } from '../haptics';

interface Props {
  round: Round;
  hole: Hole;
  teamId: string;
  /** Credits (or, on the member already credited, clears) one shot. */
  onCredit: (shot: number, member: number) => void;
}

/**
 * Whose ball was played, under a scramble team's score.
 *
 * The tee shot is the row that is always out, because it is the one the
 * minimum counts and the one the group argues about on the next tee. The rest
 * of the shots matter to fewer people, so they sit behind a disclosure: four
 * rows of four names on every hole would turn the one screen with no room to
 * spare into a form.
 *
 * Laid out as a grid with a narrow label column, so the open rows line up
 * under the tee shot's names and a column reads as one person down the hole.
 *
 * No state that outlives the hole: `.hole-body` is keyed by hole number, so
 * moving on remounts this and closes the disclosure — the next hole starts on
 * the tee, which is where the next hole starts.
 */
export function ScrambleShots({ round, hole, teamId, onCredit }: Props) {
  const team = teamOf(round, teamId);
  const [open, setOpen] = useState(false);
  if (!team || team.members.length === 0) return null;

  const score = round.scores[hole.number]?.[teamId] ?? null;
  const credits = shotsOnHole(round, hole.number, teamId);
  const rows = shotRows(score, hole.par, credits.length);
  const { min } = driveStatus(round, teamId);
  const drives = min ? teamShotStats(round, teamId).members.map((m) => m.drives) : [];
  // How many of the shots behind the disclosure already say whose they were,
  // so a closed panel still tells you whether anything is in it.
  const laterCredited = credits.slice(1, rows).filter((m) => m >= 0).length;

  const tap = (shot: number, member: number) => {
    // A credit buzzes; a clear does not, the same as a score and its blank.
    if (credits[shot] !== member) buzz(8);
    onCredit(shot, member);
  };

  const names = team.members.map((_, i) => memberShort(team, i));
  const style = { '--scr-cols': team.members.length } as React.CSSProperties;

  const row = (shot: number) => {
    const label = shotLabel(shot, score);
    return (
      <div key={shot} className="scr-row" role="group" aria-label={label}>
        <span className="scr-label" aria-hidden="true">
          {label}
        </span>
        {names.map((name, m) => {
          const on = credits[shot] === m;
          const count = shot === 0 && min ? drives[m] : null;
          return (
            <button
              key={m}
              type="button"
              className={`scr-btn${on ? ' on' : ''}${count != null && count >= min ? ' met' : ''}`}
              aria-pressed={on}
              aria-label={`${label}, ${name}${
                count == null ? '' : count > min ? `, ${count}, minimum met` : `, ${count} of ${min}`
              }`}
              onClick={() => tap(shot, m)}
            >
              <span className="scr-name">{name}</span>
              {/* Against the target until it is reached; past it, the bare
                  count — "9/2" read like a mistake, as "9 of 2" did on the
                  Board, and the green already says the minimum is met. */}
              {count != null && (
                <span className="scr-count">{count > min ? count : `${count}/${min}`}</span>
              )}
            </button>
          );
        })}
        {shot === 0 ? (
          <button
            type="button"
            className="scr-more"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            <span className="scr-more-text">All shots</span>
            {!open && laterCredited > 0 ? (
              <span className="scr-more-count" aria-label={`${laterCredited} credited`}>
                {laterCredited}
              </span>
            ) : (
              <span className={`scr-chev${open ? ' up' : ''}`} aria-hidden="true" />
            )}
          </button>
        ) : (
          <span aria-hidden="true" />
        )}
      </div>
    );
  };

  return (
    <div className="scr-shots" style={style} data-cols={team.members.length}>
      {row(0)}
      {open && rows > 1 && Array.from({ length: rows - 1 }, (_, i) => row(i + 1))}
    </div>
  );
}
