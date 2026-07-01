import type { Round } from '../types';
import { computeLeague } from '../games/league';

const fmtPts = (n: number) => (Number.isInteger(n) ? `${n}` : n.toFixed(1));

export function LeagueBoard({ round }: { round: Round }) {
  const league = computeLeague(round);
  const [t0, t1] = league.teams;
  const lead = t0.points === t1.points ? null : t0.points > t1.points ? 0 : 1;

  return (
    <section className="board league-board">
      <div className="board-head">
        <span className="board-title">🏆 League</span>
        <span className="board-status">{league.complete ? 'Final' : 'Live'}</span>
      </div>

      <ol className="board-list">
        <li className={`board-row${lead === 0 ? ' leader' : ''}`}>
          <span className="board-rank">{lead === 0 ? '🏆' : ''}</span>
          <span className="board-name">{t0.name}</span>
          <span className="board-detail">{fmtPts(t0.points)} pts</span>
        </li>
        <li className={`board-row${lead === 1 ? ' leader' : ''}`}>
          <span className="board-rank">{lead === 1 ? '🏆' : ''}</span>
          <span className="board-name">{t1.name}</span>
          <span className="board-detail">{fmtPts(t1.points)} pts</span>
        </li>
      </ol>

      <div className="league-matches">
        {league.matches.map((m) => (
          <div key={m.key} className="lmatch">
            <div className="lmatch-top">
              <span className="lmatch-label">{m.label}</span>
              <span className="lmatch-up">{m.matchup}</span>
            </div>
            <div className={`lmatch-status${m.over ? ' final' : ''}`}>{m.status}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
