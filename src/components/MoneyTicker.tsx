import type { Round } from '../types';
import { computeSettlement, formatMoney } from '../games/settlement';
import { colorMap } from '../player';

/**
 * Glanceable money line for the Hole tab. Player order is fixed, never sorted,
 * so it maps 1:1 to the steppers below and never reshuffles mid-entry.
 * Renders nothing when no stake is set — a friendly round shows no dead $0 bar.
 */
export function MoneyTicker({ round }: { round: Round }) {
  const settlement = computeSettlement(round);
  if (!settlement.active) return null;
  const colors = colorMap(round);

  return (
    <div className="money-ticker" aria-label="Money so far">
      {round.players.map((p) => {
        const net = settlement.totals[p.id] ?? 0;
        return (
          <span key={p.id} className={`tick${net > 0 ? ' up' : net < 0 ? ' down' : ''}`}>
            <span className="tick-dot" style={{ background: colors[p.id] }} aria-hidden="true" />
            <span className="tick-name">{p.name}</span>
            <span className="tick-net">{net === 0 ? '—' : formatMoney(net)}</span>
          </span>
        );
      })}
    </div>
  );
}
