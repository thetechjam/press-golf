/**
 * Brand chrome shared by every shareable card: the clubhouse-scoreboard look —
 * dark green board, gold trim, condensed caps. Layout lives in the individual
 * card renderers; only the frame and the type live here.
 */

import { trunkGlyph, type TrunkGlyph } from './trunkMark';

export const BG = '#0b3d2e';
export const CREAM = '#f4f7f2';
export const MUTED = 'rgba(244, 247, 242, 0.62)';
export const GOLD = '#e7b53c';
export const BRIGHT = '#57d9a3';
export const RED = '#ff8a7e';
/** The well of the trunk mark on the felt. */
const WELL = '#072a1f';
const GREEN_700 = '#14694e';

export const disp = (weight: number, size: number) => `${weight} ${size}px Oswald, sans-serif`;
export const mono = (size: number) => `${size}px ui-monospace, Menlo, monospace`;

export const setLS = (ctx: CanvasRenderingContext2D, px: number) => {
  (ctx as unknown as { letterSpacing: string }).letterSpacing = `${px}px`;
};

export const up = (s: string) => s.toUpperCase();

/** Truncates with an ellipsis so text never collides with a right column. */
export function fit(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + '…').width > maxWidth) t = t.slice(0, -1);
  return t + '…';
}

export function dashedRule(
  ctx: CanvasRenderingContext2D,
  y: number,
  x0: number,
  x1: number
) {
  ctx.save();
  ctx.strokeStyle = 'rgba(231, 181, 60, 0.35)';
  ctx.lineWidth = 2;
  ctx.setLineDash([8, 10]);
  ctx.beginPath();
  ctx.moveTo(x0, y);
  ctx.lineTo(x1, y);
  ctx.stroke();
  ctx.restore();
}

/**
 * The display face must be resident before canvas text is measured.
 * The Font Loading API matches faces by weight, not size — the size
 * value here is arbitrary and never affects which face loads. These
 * are the two weights `disp()` is used with in this codebase (500 and
 * 600); a new weight added elsewhere needs its own `load()` call.
 */
export const loadDisplayFonts = () =>
  Promise.all([document.fonts.load('500 1em Oswald'), document.fonts.load('600 1em Oswald')]);

export interface HeaderOpts {
  ctx: CanvasRenderingContext2D;
  width: number;
  pad: number;
  title: string;
  meta: string;
  y: number;
}

/**
 * The Trunk mark on the felt: cream stems, dark well, gold lid, the chip ball
 * with its ring of spots (no dimples — at this size they are noise). Same
 * geometry as the app icon and the Home header, from trunkMark.ts.
 */
function drawTrunkMark(ctx: CanvasRenderingContext2D, g: TrunkGlyph) {
  const u = (s: TrunkGlyph['stroke'], close: boolean) => {
    ctx.beginPath();
    ctx.moveTo(s.x0, s.top);
    ctx.lineTo(s.x0, s.by);
    ctx.arc((s.x0 + s.x1) / 2, s.by, s.r, Math.PI, 0, true);
    ctx.lineTo(s.x1, s.top);
    if (close) ctx.closePath();
  };
  u(g.well, true);
  ctx.fillStyle = WELL;
  ctx.fill();
  u(g.stroke, false);
  ctx.strokeStyle = CREAM;
  ctx.lineWidth = g.stem;
  ctx.lineCap = 'butt';
  ctx.stroke();

  const { lid, slot, ball } = g;
  ctx.save();
  ctx.translate(lid.hx, lid.hy);
  ctx.rotate((lid.angle * Math.PI) / 180);
  ctx.fillStyle = WELL;
  ctx.beginPath();
  ctx.roundRect(slot.x - lid.hx, slot.y - lid.hy, slot.w, slot.t, slot.t / 2);
  ctx.fill();
  ctx.fillStyle = GOLD;
  ctx.beginPath();
  ctx.roundRect(lid.x - lid.hx, lid.y - lid.hy, lid.w, lid.t, lid.t / 2);
  ctx.fill();
  ctx.restore();

  ctx.fillStyle = CREAM;
  ctx.beginPath();
  ctx.arc(ball.cx, ball.cy, ball.r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = GREEN_700;
  ctx.lineWidth = ball.ringW;
  if (ball.dash) {
    ctx.setLineDash([ball.dash.on, ball.dash.off]);
    ctx.lineDashOffset = ball.dash.offset;
  }
  ctx.beginPath();
  ctx.arc(ball.cx, ball.cy, ball.ringR, -Math.PI / 2, Math.PI * 1.5);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.lineDashOffset = 0;
}

/**
 * Mark, wordmark, course title shrunk to one line, meta line, gold rule. Returns the new y.
 * Leaves `ctx.textAlign` set to `'left'` on exit — both callers (shareCard.ts,
 * scorecardCard.ts) rely on this and do not re-set it before drawing further text.
 */
export function drawHeader({ ctx, width, pad, title, meta, y }: HeaderOpts): number {
  const maxw = width - pad * 2;

  // The mark sits above the word with its bowl 8px clear of the baseline the
  // word used to own; the word moves down to make room.
  const cap = 52;
  drawTrunkMark(ctx, trunkGlyph({ x: width / 2 - (cap * 0.9) / 2, y: y - 8 - cap, h: cap }));
  y += 36;
  ctx.fillStyle = GOLD;
  ctx.font = disp(600, 34);
  setLS(ctx, 9);
  ctx.textAlign = 'center';
  ctx.fillText('TRUNK', width / 2, y);
  setLS(ctx, 0);
  y += 78;

  const t = up(title);
  let size = 72;
  ctx.font = disp(600, size);
  setLS(ctx, 3);
  while (size > 44 && ctx.measureText(t).width > maxw) {
    size -= 4;
    ctx.font = disp(600, size);
  }
  ctx.fillStyle = CREAM;
  ctx.fillText(t, width / 2, y);
  setLS(ctx, 0);
  y += 54;

  ctx.fillStyle = MUTED;
  ctx.font = disp(500, 28);
  setLS(ctx, 3);
  ctx.fillText(up(meta), width / 2, y);
  setLS(ctx, 0);
  y += 44;

  ctx.strokeStyle = 'rgba(231, 181, 60, 0.55)';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(pad, y);
  ctx.lineTo(width - pad, y);
  ctx.stroke();
  y += 24;

  ctx.textAlign = 'left';
  return y;
}

/** Crops the oversized work canvas to `height`, frames it in gold, and encodes. */
export function finishCard(
  work: HTMLCanvasElement,
  width: number,
  height: number
): Promise<Blob> {
  const out = document.createElement('canvas');
  out.width = width;
  out.height = height;
  const octx = out.getContext('2d')!;
  octx.drawImage(work, 0, 0);
  octx.strokeStyle = 'rgba(231, 181, 60, 0.6)';
  octx.lineWidth = 3;
  octx.strokeRect(26, 26, width - 52, height - 52);
  octx.strokeStyle = 'rgba(231, 181, 60, 0.25)';
  octx.lineWidth = 1.5;
  octx.strokeRect(38, 38, width - 76, height - 76);

  return new Promise<Blob>((resolve, reject) => {
    out.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('canvas toBlob failed'))),
      'image/png'
    );
  });
}
