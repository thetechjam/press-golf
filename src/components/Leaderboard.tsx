import type { GameResult } from '../types';

interface Props {
  result: GameResult;
}

export function Leaderboard({ result }: Props) {
  return (
    <div className="board">
      <div className="board-head">
        <span className="board-title">{result.title}</span>
        <span className="board-status">{result.status}</span>
      </div>
      {result.standings.length === 0 ? (
        <div className="board-note">{result.note}</div>
      ) : (
        <ol className="board-list">
          {result.standings.map((s, i) => (
            <li
              key={s.playerId ?? s.label}
              className={`board-row${s.isLeader ? ' leader' : ''}`}
            >
              <span className="board-rank">
                {s.isLeader ? '🏆' : s.playerId ? s.rank : i + 1}
              </span>
              <span className="board-name">{s.label}</span>
              <span className="board-detail">{s.detail}</span>
            </li>
          ))}
        </ol>
      )}
      {result.standings.length > 0 && result.note && (
        <div className="board-foot">{result.note}</div>
      )}
    </div>
  );
}
