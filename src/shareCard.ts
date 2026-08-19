import type { Round } from './types';
import { activeResults } from './games';
import { computeLeague } from './games/league';
import { computeSettlement, formatMoney } from './games/settlement';
import { computeAwards } from './games/awards';
import {
  CREAM, MUTED, GOLD, BRIGHT, RED, BG,
  disp, mono, setLS, up, fit, dashedRule,
  loadDisplayFonts, drawHeader, finishCard,
} from './shareCanvas';

/**
 * Renders round results as a clubhouse-scoreboard PNG for sharing.
 * Draws on an oversized canvas while tracking y, then crops to fit.
 */

const W = 1080;
const PAD = 84;
const MAXW = W - PAD * 2;

const fmtPts = (n: number) => (Number.isInteger(n) ? `${n}` : n.toFixed(1));

export async function renderShareCard(round: Round): Promise<Blob> {
  await loadDisplayFonts();

  const work = document.createElement('canvas');
  work.width = W;
  work.height = 3200;
  const ctx = work.getContext('2d')!;
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, work.width, work.height);
  ctx.textBaseline = 'alphabetic';

  let y = drawHeader({
    ctx,
    width: W,
    pad: PAD,
    title: round.course || 'Golf round',
    meta: `${round.date} · ${round.players.length} players · ${round.holes.length} holes`,
    y: PAD + 36,
  });

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
    dashedRule(ctx, y, PAD, W - PAD);
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
      dashedRule(ctx, y, PAD, W - PAD);
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

  // Awards — the round's superlatives, drawn for league nights too.
  const awards = computeAwards(round);
  if (awards.length) {
    dashedRule(ctx, y, PAD, W - PAD);
    y += 32;
    ctx.font = disp(500, 32);
    ctx.fillStyle = GOLD;
    setLS(ctx, 5);
    ctx.fillText('AWARDS', PAD, y + 30);
    setLS(ctx, 0);
    y += 66;

    for (const a of awards) {
      const head = y + 34;
      ctx.font = disp(500, 32);
      ctx.fillStyle = GOLD;
      setLS(ctx, 3);
      ctx.fillText(up(a.title), PAD, head);
      setLS(ctx, 0);

      ctx.font = mono(30);
      ctx.fillStyle = MUTED;
      ctx.textAlign = 'right';
      ctx.fillText(fit(ctx, a.detail, MAXW * 0.45), W - PAD, head);
      ctx.textAlign = 'left';

      ctx.font = disp(500, 38);
      ctx.fillStyle = CREAM;
      ctx.fillText(fit(ctx, a.line, MAXW), PAD, head + 46);
      y += 100;
    }
    y += 10;
  }

  // Footer
  y += 30;
  dashedRule(ctx, y, PAD, W - PAD);
  y += 56;
  ctx.font = disp(500, 25);
  ctx.fillStyle = GOLD;
  setLS(ctx, 7);
  ctx.textAlign = 'center';
  ctx.fillText('SCORED WITH PRESS', W / 2, y);
  setLS(ctx, 0);
  y += PAD - 20;

  return finishCard(work, W, y);
}
