import { useEffect, useRef } from 'react';
import type { Round, Hole } from '../types';
import { computeSettlement, formatMoney } from '../games/settlement';
import { colorMap } from '../player';
import { PlayerAvatar } from './PlayerAvatar';
import { useEdgeFade } from '../useEdgeFade';

/**
 * Glanceable money line for the Hole tab. Player order is fixed, never sorted,
 * so it maps 1:1 to the steppers below and never reshuffles mid-entry.
 * Renders nothing when no stake is set — a friendly round shows no dead $0 bar.
 *
 * Each player is their avatar monogram, not their name: with full names a
 * four-ball ran past 390px and the fourth player's money was behind the edge
 * fade — the one figure the line exists to show. The monograms are the same
 * badges the steppers below lead with, so they map without reading, and the
 * full name is still there for a screen reader.
 */
export function MoneyTicker({ round, visible = true }: { round: Round; visible?: boolean }) {
  const { ref, edge } = useEdgeFade<HTMLDivElement>();
  const settlement = computeSettlement(round);
  const colors = colorMap(round);
  // The totals as last seen, so a figure that has moved since can flip like a
  // score does. "Seen" matters: money only moves when a hole completes, which
  // is exactly when HoleTicker swaps this face out for the hole's swing — so
  // the flip is held until this face is back on screen. Nothing flips on the
  // first render: resuming a round is not news.
  const prev = useRef<Record<string, number> | null>(null);
  const before = visible ? prev.current : null;
  useEffect(() => {
    if (visible) prev.current = settlement.totals;
  });
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
            <PlayerAvatar name={p.name} color={colors[p.id]} size={22} />
            <span className="sr-only">{p.name}</span>
            {/* Keyed by value so a change remounts it and the flip replays. */}
            <span
              key={`${net}${visible ? '' : '-hidden'}`}
              className={`tick-net${before && (before[p.id] ?? 0) !== net ? ' flap' : ''}`}
            >
              {net === 0 ? '—' : formatMoney(net)}
            </span>
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
  const colors = colorMap(round);
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
          <span key={p.id} className={`tick${n > 0 ? ' up' : n < 0 ? ' down' : ''}`}>
            <PlayerAvatar name={p.name} color={colors[p.id]} size={22} />
            <span className="sr-only">{p.name}</span>
            <span className="tick-net">{n === 0 ? '—' : formatMoney(n)}</span>
          </span>
        );
      })}
    </div>
  );
}

/**
 * The Hole tab's money line, and the crossfade between its two faces.
 *
 * MoneyTicker and SwingTicker are mutually exclusive per hole and share one
 * box by design, but swapping them was a hard cut between two entirely
 * different sets of text in the same rectangle — the eye read two lists rather
 * than one line updating. Both faces are kept mounted in a single grid cell so
 * the swap can be a blur-masked crossfade instead.
 *
 * The last swing is held in a ref because the outgoing face needs content: by
 * the frame `swing` goes null, the numbers that produced it are gone, and a
 * face with nothing in it fades out as an empty box rather than as the hole
 * the user just finished.
 */
export function HoleTicker({
  round,
  hole,
  swing,
}: {
  round: Round;
  hole: Hole;
  swing: Record<string, number> | null;
}) {
  const last = useRef<{ hole: Hole; swing: Record<string, number> } | null>(null);
  if (swing) last.current = { hole, swing };
  const shown = last.current;

  // Same "no stake, no dead $0 bar" rule MoneyTicker applies to itself — but
  // it has to be decided here too, because an empty stack is still a flex
  // child of .screen and would hold that row's 8px gap open on a friendly
  // round. visibleSwing already implies an active settlement, so this cannot
  // suppress a face that had something to show.
  if (!computeSettlement(round).active) return null;

  return (
    <div className="ticker-stack">
      <div className={`ticker-face${swing ? ' out' : ''}`} aria-hidden={!!swing}>
        <MoneyTicker round={round} visible={!swing} />
      </div>
      {shown && (
        <div className={`ticker-face${swing ? '' : ' out'}`} aria-hidden={!swing}>
          <SwingTicker round={round} hole={shown.hole} swing={shown.swing} />
        </div>
      )}
    </div>
  );
}
