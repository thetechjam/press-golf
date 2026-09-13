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
/** OUT / IN subtotal column. Narrower than TOT — it is a waypoint, not the headline. */
const NINE_W = 72;
const ROW_H = 74;
const HEAD_ROW_H = 46;
/** Name column for the junk footer. Narrower than NAME_W — nothing lines up with it. */
const JUNK_NAME_W = 230;
const JUNK_LINE_H = 34;

/** Column width per hole, floored so 9-hole rounds stay proportionate. */
const holeColWidth = (count: number) => (count > 12 ? 56 : 78);

function boardWidth(model: ScorecardModel): number {
  const cols = model.holes.length * holeColWidth(model.holes.length);
  return PAD * 2 + NAME_W + cols + model.nines.length * NINE_W + TOTAL_W * 2;
}

/**
 * Splits text into lines that fit `maxWidth` under the context's current font.
 *
 * `fit()` truncates, which is right for a name — the row it labels is still
 * there to identify it — and wrong for junk, where the part that gets cut is
 * a bet somebody is owed. A single word wider than the line is left over-long
 * rather than broken: nothing here produces one, and a mid-word break would
 * read as a typo in an image nobody can correct.
 *
 * Takes the measuring interface rather than a canvas context so the wrapping
 * can be tested without one.
 */
export function wrapLines(
  ctx: { measureText(text: string): { width: number } },
  text: string,
  maxWidth: number
): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(' ')) {
    const next = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(next).width > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
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

  // Wrapped up front, on a throwaway context, because the canvas has to be
  // sized before anything is drawn on it and clipping the footer off the
  // bottom would lose claims silently.
  const measurer = document.createElement('canvas').getContext('2d')!;
  measurer.font = disp(400, 24);
  const junkLines = model.junk.map((entry) =>
    wrapLines(measurer, entry.detail, W - PAD * 2 - JUNK_NAME_W)
  );
  const junkH = model.junk.length
    ? 48 + junkLines.reduce((n, lines) => n + lines.length, 0) * JUNK_LINE_H
    : 0;

  const work = document.createElement('canvas');
  work.width = W;
  work.height = 600 + model.rows.length * ROW_H + 400 + junkH;
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
  // Every column right of a subtotal shifts by its width. Counting the
  // subtotals that precede a hole keeps one rule for holes, subtotals and
  // totals alike, so the geometry can't drift between them.
  const ninesBefore = (holeIndex: number) =>
    model.nines.filter((n) => n.afterIndex < holeIndex).length * NINE_W;
  const colX = (i: number) => gridX + i * holeW + ninesBefore(i) + holeW / 2;
  const nineX = (n: { afterIndex: number }) =>
    gridX + (n.afterIndex + 1) * holeW + ninesBefore(n.afterIndex) + NINE_W / 2;
  const totX =
    gridX + model.holes.length * holeW + model.nines.length * NINE_W + TOTAL_W / 2;
  const parX = totX + TOTAL_W;

  // ---- Header rows: Hole, Par, Stroke Index ----
  y += HEAD_ROW_H;
  ctx.font = disp(600, 30);
  ctx.fillStyle = GOLD;
  setLS(ctx, 2);
  ctx.fillText('HOLE', PAD, y);
  model.holes.forEach((h, i) => center(ctx, `${h.number}`, colX(i), y));
  model.nines.forEach((n) => center(ctx, n.label, nineX(n), y));
  center(ctx, 'TOT', totX, y);
  center(ctx, '+/−', parX, y);
  setLS(ctx, 0);

  y += HEAD_ROW_H - 6;
  ctx.font = disp(500, 26);
  ctx.fillStyle = MUTED;
  setLS(ctx, 2);
  ctx.fillText('PAR', PAD, y);
  model.holes.forEach((h, i) => center(ctx, `${h.par}`, colX(i), y));
  model.nines.forEach((n) => center(ctx, `${n.par}`, nineX(n), y));
  center(ctx, `${model.parTotal}`, totX, y);
  setLS(ctx, 0);

  y += HEAD_ROW_H - 8;
  ctx.font = disp(500, 24);
  ctx.fillStyle = MUTED;
  setLS(ctx, 2);
  ctx.fillText('STROKE INDEX', PAD, y);
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
      }
      if (cell.chips.length > 0) {
        ctx.font = disp(600, 18);
        ctx.fillStyle = GOLD;
        ctx.textAlign = 'right';
        ctx.fillText(cell.chips.join(''), markerRightEdge, base - 30);
        ctx.textAlign = 'left';
      }
    });

    // Nine subtotals, then the round totals.
    ctx.font = mono(30);
    ctx.fillStyle = MUTED;
    model.nines.forEach((n, i) => {
      const v = row.nineTotals[i];
      center(ctx, v == null ? '' : `${v}`, nineX(n), base);
    });

    // Totals.
    ctx.font = mono(34);
    ctx.fillStyle = CREAM;
    center(ctx, row.gross == null ? '' : `${row.gross}`, totX, base);
    ctx.fillStyle = row.toPar != null && row.toPar < 0 ? GOLD : CREAM;
    center(ctx, row.toPar == null ? '' : formatToPar(row.toPar), parX, base);

    y += ROW_H;
  }

  // ---- Junk ----
  // The grid is blind to it by construction: junk is claimed, not scored, so
  // there is nothing in the scores for a column to read. Written out here for
  // the same reason a paper card carries side bets in the margin — without it
  // the shared image of a junk round is missing half the afternoon.
  if (model.junk.length > 0) {
    y += 56;
    ctx.font = disp(600, 24);
    ctx.fillStyle = GOLD;
    setLS(ctx, 5);
    ctx.fillText('JUNK', PAD, y);
    setLS(ctx, 0);
    y += 4;

    model.junk.forEach((entry, i) => {
      const lines = junkLines[i];
      ctx.font = disp(500, 26);
      ctx.fillStyle = CREAM;
      ctx.fillText(fit(ctx, up(entry.name), JUNK_NAME_W - 20), PAD, y + JUNK_LINE_H);
      ctx.font = disp(400, 24);
      ctx.fillStyle = MUTED;
      lines.forEach((line, l) => {
        ctx.fillText(line, PAD + JUNK_NAME_W, y + JUNK_LINE_H + l * JUNK_LINE_H);
      });
      y += lines.length * JUNK_LINE_H;
    });
    // The footer strapline sits 40px below whatever ends the card; from a
    // baseline rather than the bottom of a row, that reads as touching.
    y += 18;
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
