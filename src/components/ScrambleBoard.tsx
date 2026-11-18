import type { Round } from '../types';
import { driveStatus, teamShotStats } from '../games/scramble';

/** The Board's jump-chip anchor: the first team's card. */
export const TEE_SHOTS_ID = 'board-tee-shots';

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * Whose drives have been used, one card per team — on the Board while the
 * round is played and on Results after it.
 *
 * The count leads each row because it is the number the minimum is about;
 * the pips beside it are the same number drawn against the target, so "who
 * still owes" reads at a glance down the column without doing subtraction.
 * Every other shot is a quiet sub-line: it settles arguments afterwards but
 * decides nothing on the next tee.
 */
export function ScrambleBoard({ round }: { round: Round }) {
  const teams = round.options.scramble?.teams;
  if (!Array.isArray(teams) || teams.length === 0) return null;
  const many = teams.length > 1;

  return (
    <>
      {teams.map((team, t) => {
        const stats = teamShotStats(round, team.id);
        const status = driveStatus(round, team.id);
        const name = round.players.find((p) => p.id === team.id)?.name.trim() || `Team ${t + 1}`;
        const untouched = stats.members.every((m) => m.shots === 0);
        const warn = status.state === 'tight' || status.state === 'short';
        return (
          <section
            key={team.id}
            className="board scr-board"
            id={t === 0 ? TEE_SHOTS_ID : undefined}
            aria-label={many ? `Tee shots, ${name}` : 'Tee shots'}
          >
            <div className="board-head">
              <span className="board-title">
                Tee shots
                {many && <span className="scr-team">{name}</span>}
              </span>
              {status.min > 0 && <span className="board-status">{status.min} each</span>}
            </div>

            <ul className="scr-members">
              {stats.members.map((m, i) => {
                const met = status.min > 0 && m.drives >= status.min;
                return (
                  <li key={i} className="scr-member">
                    <span className="scr-member-name">{m.name}</span>
                    {status.min > 0 && (
                      <span className="scr-pips" aria-hidden="true">
                        {Array.from({ length: status.min }, (_, k) => (
                          <span key={k} className={`scr-pip${k < m.drives ? ' used' : ''}`} />
                        ))}
                      </span>
                    )}
                    <span
                      className={`scr-drives${met ? ' met' : ''}`}
                      aria-label={
                        status.min > 0
                          ? `${m.drives} of ${status.min} tee shots`
                          : plural(m.drives, 'tee shot', 'tee shots')
                      }
                    >
                      {m.drives}
                      {/* Only while still short: once met, the full pips say
                          the target, and "5 of 3" read like a mistake. */}
                      {status.min > 0 && !met && <span className="scr-of"> of {status.min}</span>}
                    </span>
                    <span className="scr-member-sub">
                      {plural(m.shots, 'shot', 'shots')} played
                      {m.holed > 0 && ` · ${m.holed} holed out`}
                    </span>
                  </li>
                );
              })}
            </ul>

            {status.note ? (
              <p className={`scr-note scr-${status.state}${warn ? ' warn' : ''}`}>{status.note}</p>
            ) : untouched ? (
              <p className="scr-note">Tap a name under the team’s score to say whose shot it was.</p>
            ) : null}
          </section>
        );
      })}
    </>
  );
}
