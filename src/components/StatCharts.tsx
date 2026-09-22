import { useState } from 'react';
import type { PlayerStats, RoundPoint } from '../stats';
import { formatToPar } from '../stats';
import { formatRoundDate } from '../roundDate';

/**
 * Scoring mix as one bar, eagles to worse, each part as wide as its count.
 *
 * Colour runs out from par in both directions — greens under, reds over, a
 * grey at the middle — so the bar reads as "which side of par" before it reads
 * as five things. It carries no numbers: the chips under it do, and each chip
 * wears its segment's swatch, so nothing here is colour alone.
 */
export function MixBar({ tally }: { tally: PlayerStats['tally'] }) {
  const parts: [keyof PlayerStats['tally'], number][] = [
    ['eagles', tally.eagles],
    ['birdies', tally.birdies],
    ['pars', tally.pars],
    ['bogeys', tally.bogeys],
    ['others', tally.others],
  ];
  const shown = parts.filter(([, n]) => n > 0);
  if (shown.length < 2) return null;
  return (
    <div className="mix-bar" aria-hidden="true">
      {shown.map(([k, n]) => (
        <span key={k} className={`mix-seg mix-${k}`} style={{ flexGrow: n }} />
      ))}
    </div>
  );
}

const W = 300;
const H = 72;
const PAD = 8;

/** A round's score scaled to 18 holes, so a nine sits on the same axis. */
const per18 = (p: RoundPoint) => (p.toPar / p.holes) * 18;

/**
 * Score against par, one point per fully scored round, oldest on the left.
 *
 * Up is more strokes, as on a card. Tapping (or arrowing along) picks a round
 * and the line under the chart names it — the phone has no hover, so the
 * caption is the tooltip. It opens on the latest round, the one people look
 * for first.
 */
export function TrendLine({ points, color }: { points: RoundPoint[]; color: string }) {
  const [sel, setSel] = useState(points.length - 1);
  if (points.length < 3) return null;
  const i = Math.min(sel, points.length - 1);

  const ys = points.map(per18);
  const lo = Math.min(...ys);
  const hi = Math.max(...ys);
  const span = hi - lo;
  const x = (k: number) => PAD + (k * (W - 2 * PAD)) / (points.length - 1);
  // A player who shot the same number every time is a flat line through the
  // middle, not one pinned to the top edge.
  const y = (v: number) => (span ? PAD + ((v - lo) / span) * (H - 2 * PAD) : H / 2);
  const path = ys.map((v, k) => `${k ? 'L' : 'M'}${x(k).toFixed(1)},${y(v).toFixed(1)}`).join('');
  const mixed = points.some((p) => p.holes !== 18);
  const step = (W - 2 * PAD) / (points.length - 1);

  const p = points[i];
  const bestK = ys.indexOf(lo);

  return (
    <div className="trend">
      <div className="trend-head">
        <span className="stat-cap">Vs par by round{mixed ? ' · per 18' : ''}</span>
        <span className="stat-cap">
          {formatToPar(lo)} best · {formatToPar(hi)} worst
        </span>
      </div>
      <div
        className="trend-plot"
        tabIndex={0}
        role="group"
        aria-label={`Score against par over ${points.length} rounds. Arrow keys pick a round.`}
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft') setSel(Math.max(0, i - 1));
          else if (e.key === 'ArrowRight') setSel(Math.min(points.length - 1, i + 1));
          else return;
          e.preventDefault();
        }}
      >
        <svg viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
          <line className="trend-guide" x1={x(i)} x2={x(i)} y1={0} y2={H} />
          <path d={path} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" />
          <circle className="trend-best" cx={x(bestK)} cy={y(lo)} r={3} />
          <circle className="trend-dot" cx={x(i)} cy={y(ys[i])} r={5} fill={color} />
          {points.map((_, k) => (
            <rect
              key={k}
              className="trend-hit"
              x={x(k) - step / 2}
              y={0}
              width={step}
              height={H}
              onClick={() => setSel(k)}
            />
          ))}
        </svg>
      </div>
      <p className="trend-caption" aria-live="polite">
        <strong>{formatToPar(p.toPar)}</strong>
        {p.holes !== 18 ? ` over ${p.holes}` : ''}
        {p.course ? ` at ${p.course}` : ''} · {formatRoundDate(p.date)}
      </p>
    </div>
  );
}
