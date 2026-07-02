import type { Round } from '../types';
import { strokeIndexMap, strokesReceivedOnHole } from '../games/handicap';
import { scoreMarkClass } from '../scoreMark';

interface Props {
  round: Round;
  currentHole?: number;
  onJumpToHole?: (index: number) => void;
}

/** Full-round grid: holes across, players down. Tap a cell to edit that hole. */
export function Scorecard({ round, currentHole, onJumpToHole }: Props) {
  const { holes, players } = round;
  const useNet = round.options.useNet;
  const siMap = strokeIndexMap(round);
  const parTotal = holes.reduce((s, h) => s + h.par, 0);

  const toParStr = (n: number) => (n === 0 ? 'E' : n > 0 ? `+${n}` : `${n}`);

  return (
    <div className="card-scroll">
      <table className="scorecard">
        <thead>
          <tr>
            <th className="sc-corner">Hole</th>
            {holes.map((h, i) => (
              <th
                key={h.number}
                className={`sc-hole${h.number === currentHole ? ' current' : ''}`}
                onClick={() => onJumpToHole?.(i)}
              >
                {h.number}
              </th>
            ))}
            <th className="sc-total">Tot</th>
            <th className="sc-total">+/−</th>
          </tr>
          <tr className="sc-par-row">
            <th className="sc-corner">Par</th>
            {holes.map((h) => (
              <td key={h.number}>{h.par}</td>
            ))}
            <td className="sc-total">{parTotal}</td>
            <td className="sc-total" />
          </tr>
        </thead>
        <tbody>
          {players.map((p) => {
            let gross = 0;
            let played = 0;
            let playedPar = 0;
            return (
              <tr key={p.id}>
                <th className="sc-name">{p.name}</th>
                {holes.map((h, i) => {
                  const raw = round.scores[h.number]?.[p.id] ?? null;
                  if (raw != null) {
                    gross += raw;
                    played += 1;
                    playedPar += h.par;
                  }
                  const toPar = raw == null ? 0 : raw - h.par;
                  const tone =
                    raw == null ? '' : toPar < 0 ? ' under' : toPar > 0 ? ' over' : ' even';
                  const dots = useNet
                    ? strokesReceivedOnHole(p.handicap ?? 0, siMap[h.number], holes.length)
                    : 0;
                  return (
                    <td
                      key={h.number}
                      className={`sc-cell${tone}${h.number === currentHole ? ' current' : ''}`}
                      onClick={() => onJumpToHole?.(i)}
                    >
                      {raw != null && <span className={scoreMarkClass(toPar)}>{raw}</span>}
                      {dots > 0 && <span className="sc-dots">{'•'.repeat(dots)}</span>}
                    </td>
                  );
                })}
                <td className="sc-total">{played ? gross : ''}</td>
                <td className="sc-total">{played ? toParStr(gross - playedPar) : ''}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
