import type { Round } from './types';
import { activeResults } from './games';
import { computeLeague } from './games/league';
import { computeSettlement, formatMoney } from './games/settlement';

/**
 * Renders round results as a clubhouse-scoreboard PNG for sharing:
 * dark green board, gold trim, condensed caps — the group-chat billboard.
 * Draws on an oversized canvas while tracking y, then crops to fit.
 */

const W = 1080;
const PAD = 84;
const MAXW = W - PAD * 2;

const BG = '#0b3d2e';
const CREAM = '#f4f7f2';
const MUTED = 'rgba(244, 247, 242, 0.62)';
const GOLD = '#e7b53c';
const BRIGHT = '#57d9a3';
const RED = '#ff8a7e';

const disp = (weight: number, size: number) => `${weight} ${size}px Oswald, sans-serif`;
const mono = (size: number) => `${size}px ui-monospace, Menlo, monospace`;

const setLS = (ctx: CanvasRenderingContext2D, px: number) => {
  (ctx as unknown as { letterSpacing: string }).letterSpacing = `${px}px`;
};

const up = (s: string) => s.toUpperCase();

const fmtPts = (n: number) => (Number.isInteger(n) ? `${n}` : n.toFixed(1));

/** Truncates with an ellipsis so text never collides with a right column. */
function fit(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + '…').width > maxWidth) t = t.slice(0, -1);
  return t + '…';
}

function dashedRule(ctx: CanvasRenderingContext2D, y: number) {
  ctx.save();
  ctx.strokeStyle = 'rgba(231, 181, 60, 0.35)';
  ctx.lineWidth = 2;
  ctx.setLineDash([8, 10]);
  ctx.beginPath();
  ctx.moveTo(PAD, y);
  ctx.lineTo(W - PAD, y);
  ctx.stroke();
  ctx.restore();
}

export async function renderShareCard(round: Round): Promise<Blob> {
  // The display face must be resident before canvas text is measured.
  await Promise.all([
    document.fonts.load('500 52px Oswald'),
    document.fonts.load('600 72px Oswald'),
  ]);

  const work = document.createElement('canvas');
  work.width = W;
  work.height = 3200;
  const ctx = work.getContext('2d')!;
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, work.width, work.height);
  ctx.textBaseline = 'alphabetic';

  let y = PAD + 36;

  // Wordmark
  ctx.fillStyle = GOLD;
  ctx.font = disp(600, 34);
  setLS(ctx, 9);
  ctx.textAlign = 'center';
  ctx.fillText('PRESS', W / 2, y);
  setLS(ctx, 0);
  y += 78;

  // Course name, shrunk to fit on one line
  const title = up(round.course || 'Golf round');
  let size = 72;
  ctx.font = disp(600, size);
  setLS(ctx, 3);
  while (size > 44 && ctx.measureText(title).width > MAXW) {
    size -= 4;
    ctx.font = disp(600, size);
  }
  ctx.fillStyle = CREAM;
  ctx.fillText(title, W / 2, y);
  setLS(ctx, 0);
  y += 54;

  ctx.fillStyle = MUTED;
  ctx.font = disp(500, 28);
  setLS(ctx, 3);
  ctx.fillText(
    up(`${round.date} · ${round.players.length} players · ${round.holes.length} holes`),
    W / 2,
    y
  );
  setLS(ctx, 0);
  y += 44;

  ctx.strokeStyle = 'rgba(231, 181, 60, 0.55)';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(PAD, y);
  ctx.lineTo(W - PAD, y);
  ctx.stroke();
  y += 24;

  ctx.textAlign = 'left';

  if (round.options.league) {
    const league = computeLeague(round);
    const [a, b] = league.teams;
    const lead = a.points === b.points ? -1 : a.points > b.points ? 0 : 1;

    league.teams.forEach((t, i) => {
      const rowTop = y;
      const rowH = 96;
      if (i === lead) {
        ctx.fillStyle = 'rgba(231, 181, 60, 0.13)';
        ctx.beginPath();
        ctx.roundRect(PAD - 20, rowTop, MAXW + 40, rowH, 14);
        ctx.fill();
        ctx.fillStyle = GOLD;
        ctx.fillRect(PAD - 20, rowTop + 14, 6, rowH - 28);
      }
      const base = rowTop + rowH / 2 + 18;
      ctx.font = disp(600, 44);
      ctx.textAlign = 'right';
      const ptsText = `${fmtPts(t.points)} PTS`;
      const ptsW = ctx.measureText(ptsText).width;
      ctx.fillStyle = i === lead ? GOLD : CREAM;
      ctx.fillText(ptsText, W - PAD, base);
      ctx.textAlign = 'left';
      ctx.font = disp(500, 50);
      ctx.fillStyle = CREAM;
      setLS(ctx, 2);
      ctx.fillText(fit(ctx, up(t.name), MAXW - ptsW - 40), PAD + 8, base);
      setLS(ctx, 0);
      y += rowH + 6;
    });

    y += 18;
    dashedRule(ctx, y);
    y += 30;

    for (const m of league.matches) {
      const base = y + 40;
      ctx.font = disp(500, 38);
      ctx.fillStyle = CREAM;
      setLS(ctx, 2);
      ctx.fillText(up(m.label), PAD, base);
      setLS(ctx, 0);
      ctx.font = disp(500, 27);
      ctx.fillStyle = MUTED;
      ctx.textAlign = 'right';
      ctx.fillText(fit(ctx, up(m.matchup), MAXW * 0.55), W - PAD, base);
      ctx.textAlign = 'left';
      ctx.font = disp(500, 33);
      ctx.fillStyle = BRIGHT;
      ctx.fillText(up(m.status), PAD, base + 44);
      y += 116;
    }
  } else {
    const results = activeResults(round);
    for (const r of results) {
      const head = y + 42;
      ctx.font = disp(500, 38);
      ctx.fillStyle = GOLD;
      setLS(ctx, 3);
      ctx.fillText(up(r.title), PAD, head);
      setLS(ctx, 0);
      ctx.font = disp(500, 27);
      ctx.fillStyle = MUTED;
      ctx.textAlign = 'right';
      ctx.fillText(fit(ctx, up(r.status), MAXW * 0.5), W - PAD, head);
      ctx.textAlign = 'left';
      y += 66;

      for (const s of r.standings) {
        const base = y + 40;
        ctx.font = disp(500, 30);
        ctx.fillStyle = MUTED;
        ctx.fillText(s.playerId ? `${s.rank}` : '·', PAD, base);
        ctx.font = mono(34);
        ctx.textAlign = 'right';
        const detW = ctx.measureText(s.detail).width;
        ctx.fillStyle = s.isLeader ? GOLD : CREAM;
        ctx.fillText(s.detail, W - PAD, base);
        ctx.textAlign = 'left';
        ctx.font = disp(500, 42);
        ctx.fillStyle = CREAM;
        setLS(ctx, 2);
        ctx.fillText(fit(ctx, up(s.label), MAXW - detW - 110), PAD + 56, base);
        setLS(ctx, 0);
        y += 66;
      }
      y += 26;
    }

    const settlement = computeSettlement(round);
    if (settlement.active) {
      dashedRule(ctx, y);
      y += 32;
      ctx.font = disp(500, 32);
      ctx.fillStyle = GOLD;
      setLS(ctx, 5);
      ctx.fillText('SETTLEMENT', PAD, y + 30);
      setLS(ctx, 0);
      y += 62;

      if (settlement.transactions.length === 0) {
        ctx.font = disp(500, 36);
        ctx.fillStyle = BRIGHT;
        setLS(ctx, 4);
        ctx.textAlign = 'center';
        ctx.fillText('ALL SQUARE — EVERYONE’S EVEN', W / 2, y + 36);
        ctx.textAlign = 'left';
        setLS(ctx, 0);
        y += 70;
      } else {
        for (const t of settlement.transactions) {
          const base = y + 40;
          ctx.font = mono(40);
          ctx.textAlign = 'right';
          const amtW = ctx.measureText(formatMoney(t.amount)).width;
          ctx.fillStyle = RED;
          ctx.fillText(formatMoney(t.amount), W - PAD, base);
          ctx.textAlign = 'left';
          ctx.font = disp(500, 38);
          ctx.fillStyle = CREAM;
          setLS(ctx, 2);
          ctx.fillText(
            fit(ctx, up(`${t.from} pays ${t.to}`), MAXW - amtW - 40),
            PAD,
            base
          );
          setLS(ctx, 0);
          y += 66;
        }
      }
    }
  }

  // Footer
  y += 30;
  dashedRule(ctx, y);
  y += 56;
  ctx.font = disp(500, 25);
  ctx.fillStyle = GOLD;
  setLS(ctx, 7);
  ctx.textAlign = 'center';
  ctx.fillText('SCORED WITH PRESS', W / 2, y);
  setLS(ctx, 0);
  y += PAD - 20;

  // Crop to content and frame it
  const out = document.createElement('canvas');
  out.width = W;
  out.height = y;
  const octx = out.getContext('2d')!;
  octx.drawImage(work, 0, 0);
  octx.strokeStyle = 'rgba(231, 181, 60, 0.6)';
  octx.lineWidth = 3;
  octx.strokeRect(26, 26, W - 52, y - 52);
  octx.strokeStyle = 'rgba(231, 181, 60, 0.25)';
  octx.lineWidth = 1.5;
  octx.strokeRect(38, 38, W - 76, y - 76);

  return new Promise<Blob>((resolve, reject) => {
    out.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('canvas toBlob failed'))),
      'image/png'
    );
  });
}
