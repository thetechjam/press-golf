import type { Round } from './types';
import { buildScorecard, formatToPar, type ScorecardModel } from './scorecardModel';
import {
  BG, CREAM, MUTED, GOLD,
  disp, mono, setLS, up, fit,
  loadDisplayFonts, drawHeader, finishCard,
} from './shareCanvas';

/**
 * Renders the hole-by-hole grid as a landscape PNG in the same clubhouse livery
 * as the results card. Width scales with hole count so a 9-hole league night
 * doesn't come out half empty.
 */

const PAD = 64;
// Wide enough that ordinary two-word names (~12-14 chars, e.g. "Bailey Ford",
// "Christina Ng") fit under fit()'s truncation budget even with a handicap
// drawn alongside them (NAME_W - 20 - hcpW; hcpW ~62px for a 2-digit
// handicap in mono 26). Genuinely long names still truncate via fit().
const NAME_W = 380;
const TOTAL_W = 96;
const ROW_H = 74;
const HEAD_ROW_H = 46;

/** Column width per hole, floored so 9-hole rounds stay proportionate. */
const holeColWidth = (count: number) => (count > 12 ? 56 : 78);

function boardWidth(model: ScorecardModel): number {
  const cols = model.holes.length * holeColWidth(model.holes.length);
  return PAD * 2 + NAME_W + cols + TOTAL_W * 2;
}

/** Centers text in a column. */
function center(ctx: CanvasRenderingContext2D, text: string, x: number, y: number) {
  ctx.textAlign = 'center';
  ctx.fillText(text, x, y);
  ctx.textAlign = 'left';
}

export async function renderScorecardCard(round: Round): Promise<Blob> {
  await loadDisplayFonts();

  const model = buildScorecard(round);
  const holeW = holeColWidth(model.holes.length);
  const W = boardWidth(model);

  const work = document.createElement('canvas');
  work.width = W;
  work.height = 600 + model.rows.length * ROW_H + 400;
  const ctx = work.getContext('2d')!;
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, work.width, work.height);
  ctx.textBaseline = 'alphabetic';

  let y = drawHeader({
    ctx,
    width: W,
    pad: PAD,
    title: round.course || 'Golf round',
    meta: `${round.date} · ${round.players.length} players · ${model.holes.length} holes`,
    y: PAD + 36,
  });

  const gridX = PAD + NAME_W;
  const colX = (i: number) => gridX + i * holeW + holeW / 2;
  const totX = gridX + model.holes.length * holeW + TOTAL_W / 2;
  const parX = totX + TOTAL_W;

  // ---- Header rows: Hole, Par, SI ----
  y += HEAD_ROW_H;
  ctx.font = disp(600, 30);
  ctx.fillStyle = GOLD;
  setLS(ctx, 2);
  ctx.fillText('HOLE', PAD, y);
  model.holes.forEach((h, i) => center(ctx, `${h.number}`, colX(i), y));
  center(ctx, 'TOT', totX, y);
  center(ctx, '+/−', parX, y);
  setLS(ctx, 0);

  y += HEAD_ROW_H - 6;
  ctx.font = disp(500, 26);
  ctx.fillStyle = MUTED;
  setLS(ctx, 2);
  ctx.fillText('PAR', PAD, y);
  model.holes.forEach((h, i) => center(ctx, `${h.par}`, colX(i), y));
  center(ctx, `${model.parTotal}`, totX, y);
  setLS(ctx, 0);

  y += HEAD_ROW_H - 8;
  ctx.font = disp(500, 24);
  ctx.fillStyle = MUTED;
  setLS(ctx, 2);
  ctx.fillText('SI', PAD, y);
  model.holes.forEach((h, i) => center(ctx, `${h.strokeIndex}`, colX(i), y));
  setLS(ctx, 0);

  y += 20;
  ctx.strokeStyle = 'rgba(231, 181, 60, 0.45)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(PAD, y);
  ctx.lineTo(W - PAD, y);
  ctx.stroke();

  // ---- Player rows ----
  for (const row of model.rows) {
    const base = y + ROW_H - 22;

    // Name, with handicap when the round scores net.
    ctx.font = disp(500, 36);
    ctx.fillStyle = CREAM;
    setLS(ctx, 2);
    const hcpText = model.showHandicap ? `  ${row.handicap}` : '';
    let hcpW = 0;
    if (hcpText) {
      // Measure under the same letterSpacing (0) the handicap text is later
      // drawn with — measuring under the name's letterSpacing (2) would
      // overstate hcpW and needlessly shrink the name's truncation budget.
      ctx.font = mono(26);
      setLS(ctx, 0);
      hcpW = ctx.measureText(hcpText).width;
      setLS(ctx, 2);
      ctx.font = disp(500, 36);
    }
    const nameText = fit(ctx, up(row.name), NAME_W - 20 - hcpW);
    ctx.fillText(nameText, PAD, base);
    if (hcpText) {
      // Measured under the same font/letterSpacing (disp 36 / LS 2) the name
      // was just drawn with, so this matches the drawn glyph width.
      const nameW = ctx.measureText(nameText).width;
      setLS(ctx, 0);
      ctx.font = mono(26);
      ctx.fillStyle = MUTED;
      ctx.fillText(hcpText, PAD + nameW, base);
      setLS(ctx, 2);
    }
    setLS(ctx, 0);

    // Per-hole scores.
    row.cells.forEach((cell, i) => {
      const cx = colX(i);
      if (cell.score != null) {
        // Circle under par, square over, doubled at ±2 — the same convention
        // scoreMark.ts encodes as CSS classes for the screen.
        const mark = cell.markClass;
        if (mark) {
          ctx.strokeStyle = cell.toPar < 0 ? GOLD : 'rgba(255, 138, 126, 0.85)';
          ctx.lineWidth = 2;
          const r = 22;
          const drawMark = (rr: number) => {
            ctx.beginPath();
            if (cell.toPar < 0) ctx.arc(cx, base - 11, rr, 0, Math.PI * 2);
            else ctx.rect(cx - rr, base - 11 - rr, rr * 2, rr * 2);
            ctx.stroke();
          };
          drawMark(r);
          if (mark.includes('mark-double')) drawMark(r - 6);
        }
        ctx.font = mono(32);
        ctx.fillStyle = cell.toPar < 0 ? GOLD : CREAM;
        center(ctx, `${cell.score}`, cx, base);
      }

      // Stroke markers, top-right of the cell — dots for net, match keys for
      // league. Right-anchored on the column's own right edge (minus a small
      // inset) rather than centered on a guessed point: right-aligned text
      // grows leftward, so it can never bleed into the next column no matter
      // how many dots or chips there are. Do not nest this in center() —
      // it needs its own textAlign, not the centered one.
      const markerRightEdge = cx + holeW / 2 - 6;
      if (cell.dots > 0) {
        ctx.font = mono(20);
        ctx.fillStyle = GOLD;
        ctx.textAlign = 'right';
        ctx.fillText('•'.repeat(cell.dots), markerRightEdge, base - 30);
        ctx.textAlign = 'left';
      } else if (cell.chips.length > 0) {
        ctx.font = disp(600, 18);
        ctx.fillStyle = GOLD;
        ctx.textAlign = 'right';
        ctx.fillText(cell.chips.join(''), markerRightEdge, base - 30);
        ctx.textAlign = 'left';
      }
    });

    // Totals.
    ctx.font = mono(34);
    ctx.fillStyle = CREAM;
    center(ctx, row.gross == null ? '' : `${row.gross}`, totX, base);
    ctx.fillStyle = row.toPar != null && row.toPar < 0 ? GOLD : CREAM;
    center(ctx, row.toPar == null ? '' : formatToPar(row.toPar), parX, base);

    y += ROW_H;
  }

  // ---- Footer ----
  y += 40;
  ctx.font = disp(500, 25);
  ctx.fillStyle = GOLD;
  setLS(ctx, 7);
  ctx.textAlign = 'center';
  ctx.fillText('SCORED WITH PRESS', W / 2, y);
  setLS(ctx, 0);
  ctx.textAlign = 'left';
  y += PAD - 20;

  return finishCard(work, W, y);
}
