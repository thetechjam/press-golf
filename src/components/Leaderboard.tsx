import type { GameResult } from '../types';
import { PlayerAvatar } from './PlayerAvatar';

interface Props {
  result: GameResult;
  colorOf?: (playerId: string) => string | undefined;
  hcpOf?: (playerId: string) => number | undefined;
}

export function Leaderboard({ result, colorOf, hcpOf }: Props) {

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
          {result.standings.map((s, i) => {
            const color = s.playerId ? colorOf?.(s.playerId) : undefined;
            return (
              <li
                key={s.playerId ?? s.label}
                className={`board-row${s.isLeader ? ' leader' : ''}`}
              >
                <span className="board-rank">{s.playerId ? s.rank : i + 1}</span>
                <span className="board-name">
                  {color && <PlayerAvatar name={s.label} color={color} size={22} />}
                  <span className="board-name-text">{s.label}</span>
                  {s.playerId && hcpOf?.(s.playerId) != null && (
                    <span className="board-hcp" aria-label={`Handicap ${hcpOf(s.playerId)}`}>
                      {hcpOf(s.playerId)}
                    </span>
                  )}
                </span>
                <span className="board-detail">{s.detail}</span>
              </li>
            );
          })}
        </ol>
      )}
      {result.standings.length > 0 && result.note && (
        <div className="board-foot">{result.note}</div>
      )}
    </div>
  );
}
