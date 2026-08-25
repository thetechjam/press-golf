import type { Round, Hole } from '../types';
import { computeSettlement, formatMoney } from '../games/settlement';
import { colorMap } from '../player';
import { useEdgeFade } from '../useEdgeFade';

/**
 * Glanceable money line for the Hole tab. Player order is fixed, never sorted,
 * so it maps 1:1 to the steppers below and never reshuffles mid-entry.
 * Renders nothing when no stake is set — a friendly round shows no dead $0 bar.
 */
export function MoneyTicker({ round }: { round: Round }) {
  const { ref, edge } = useEdgeFade<HTMLDivElement>();
  const settlement = computeSettlement(round);
  const colors = colorMap(round);
  if (!settlement.active) return null;

  return (
    <div
      className="money-ticker"
      ref={ref}
      data-fade={edge}
      role="group"
      aria-label="Money so far"
    >
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

/**
 * Replaces MoneyTicker for exactly one hole: the one that was just completed.
 * Renders in the same slot, using the same .money-ticker box (so it costs the
 * same ~31px and never grows into the steppers below), so switching between
 * the running total and this costs no layout height either way.
 *
 * `swing` must already be gated by `visibleSwing` (games/money.ts) — this
 * component only renders what it's given, it re-derives nothing.
 */
export function SwingTicker({
  round,
  hole,
  swing,
}: {
  round: Round;
  hole: Hole;
  swing: Record<string, number>;
}) {
  const { ref, edge } = useEdgeFade<HTMLDivElement>();
  return (
    <div
      className="money-ticker"
      ref={ref}
      data-fade={edge}
      role="group"
      aria-label={`Money swing on hole ${hole.number}`}
    >
      <span className="swing-label">Hole {hole.number}</span>
      {round.players.map((p) => {
        const n = swing[p.id] ?? 0;
        return (
          <span key={p.id} className={`swing-net${n > 0 ? ' up' : n < 0 ? ' down' : ''}`}>
            {p.name} {n === 0 ? '—' : formatMoney(n)}
          </span>
        );
      })}
    </div>
  );
}
