import type { Round } from '../types';
import { computeSettlement, formatMoney } from './settlement';
import { totalStrokesReceived, usesHandicaps } from './handicap';
import { computeSkins } from './skins';
import { wolfOutcomes } from './wolf';

/**
 * Round awards — the ribbing layer over a finished round.
 *
 * Every candidate is a pure function of the Round that returns an award or
 * null when the round didn't earn it, so a quiet gross round yields a short
 * list rather than filler. `score` is a shared notability scale used only to
 * rank candidates against each other.
 */
export interface Award {
  id: string;
  title: string;
  line: string;
  detail: string;
  playerIds: string[];
  score: number;
}

/** How many awards a round shows, and how many any one player may take. */
const MAX_AWARDS = 4;
const MAX_PER_PLAYER = 2;

const nameOf = (round: Round, id: string) =>
  round.players.find((p) => p.id === id)?.name ?? '';

/** Verb for a score under par, e.g. -2 -> 'eagled'. */
function underParVerb(under: number): string {
  if (under >= 3) return 'albatrossed';
  if (under === 2) return 'eagled';
  return 'birdied';
}

/** Noun for a score under par with its article, e.g. -2 -> 'an eagle'. */
function underParNoun(under: number): string {
  if (under >= 3) return 'an albatross';
  if (under === 2) return 'an eagle';
  return 'a birdie';
}

/**
 * The biggest net swing in the round, used as the yardstick for every money
 * award. Scoring dollars relatively rather than absolutely keeps the ranking
 * about how lopsided the round was, not how big the stakes were — a $2 game
 * and a $50 game produce the same card.
 */
function moneySpread(round: Round): number {
  const totals = computeSettlement(round).totals;
  return Math.max(1, ...round.players.map((p) => Math.abs(totals[p.id] ?? 0)));
}

function shotOfTheDay(round: Round): Award | null {
  let best:
    | { playerId: string; hole: number; par: number; strokes: number; under: number; si: number }
    | null = null;

  for (const h of round.holes) {
    const si = h.strokeIndex ?? Number.MAX_SAFE_INTEGER;
    for (const p of round.players) {
      const strokes = round.scores[h.number]?.[p.id];
      if (strokes == null) continue;
      const under = h.par - strokes;
      if (under < 1) continue;
      // Ties go to the harder hole — a birdie on the number-1 index is the
      // better story than the same birdie on the easiest hole out there.
      if (best == null || under > best.under || (under === best.under && si < best.si))
        best = { playerId: p.id, hole: h.number, par: h.par, strokes, under, si };
    }
  }

  if (!best) return null;

  return {
    id: 'shot-of-the-day',
    title: 'Shot of the Day',
    line: `${nameOf(round, best.playerId)} ${underParVerb(best.under)} ${best.hole}`,
    detail: `${best.strokes} on a par ${best.par}`,
    playerIds: [best.playerId],
    score: 40 + best.under * 22,
  };
}

function snowman(round: Round): Award | null {
  let worst: { playerId: string; hole: number; par: number; strokes: number; over: number } | null =
    null;

  for (const h of round.holes) {
    for (const p of round.players) {
      const strokes = round.scores[h.number]?.[p.id];
      if (strokes == null) continue;
      const over = strokes - h.par;
      // A double is a bad hole; a triple is a story. Only stories qualify.
      if (over < 3) continue;
      if (worst == null || over > worst.over)
        worst = { playerId: p.id, hole: h.number, par: h.par, strokes, over };
    }
  }

  if (!worst) return null;

  return {
    id: 'snowman',
    title: 'The Snowman',
    line: `${nameOf(round, worst.playerId)} found trouble on ${worst.hole}`,
    detail: `${worst.strokes} on a par ${worst.par} · +${worst.over}`,
    playerIds: [worst.playerId],
    score: 30 + worst.over * 8,
  };
}

function bounceBack(round: Round): Award | null {
  let best:
    | { playerId: string; badHole: number; bad: number; goodHole: number; good: number; under: number }
    | null = null;

  for (let i = 1; i < round.holes.length; i++) {
    const prev = round.holes[i - 1];
    const cur = round.holes[i];
    for (const p of round.players) {
      const bad = round.scores[prev.number]?.[p.id];
      const good = round.scores[cur.number]?.[p.id];
      if (bad == null || good == null) continue;
      if (bad - prev.par < 2) continue; // needs a double or worse to bounce back from
      const under = cur.par - good;
      if (under < 1) continue;
      if (best == null || under > best.under)
        best = {
          playerId: p.id,
          badHole: prev.number,
          bad,
          goodHole: cur.number,
          good,
          under,
        };
    }
  }

  if (!best) return null;

  return {
    id: 'bounce-back',
    title: 'Bounce Back',
    line: `${nameOf(round, best.playerId)} answered ${best.badHole} with ${underParNoun(best.under)}`,
    detail: `${best.bad} on ${best.badHole} · ${best.good} on ${best.goodHole}`,
    playerIds: [best.playerId],
    score: 45 + best.under * 10,
  };
}

function atm(round: Round): Award | null {
  const settlement = computeSettlement(round);
  if (!settlement.active) return null;

  const losers = round.players
    .map((p) => ({ id: p.id, net: settlement.totals[p.id] ?? 0 }))
    .filter((x) => x.net < 0)
    .sort((a, b) => a.net - b.net);

  const worst = losers[0];
  if (!worst) return null;

  return {
    id: 'atm',
    title: 'The ATM',
    line: `${nameOf(round, worst.id)} funded the round`,
    detail: formatMoney(worst.net),
    playerIds: [worst.id],
    score: 35 + (30 * Math.abs(worst.net)) / moneySpread(round),
  };
}

/**
 * Running money after each hole: the settlement of the round truncated to
 * holes 1..n. Differencing this gives what a hole was worth *as the round
 * unfolded* — a carried skin lands on the hole that won it. That is a
 * different question from `money.holeSwing`, which asks the counterfactual
 * "what if this hole had never been played" and is only exact for the last
 * completed hole; awards need the running view over every hole.
 */
function moneyByHole(round: Round): { hole: number; net: Record<string, number> }[] {
  const out: { hole: number; net: Record<string, number> }[] = [];
  let prev: Record<string, number> = {};

  for (const h of round.holes) {
    const upTo = round.holes.filter((x) => x.number <= h.number).map((x) => x.number);
    const scores = Object.fromEntries(
      Object.entries(round.scores).filter(([n]) => upTo.includes(Number(n)))
    );
    const totals = computeSettlement({ ...round, scores }).totals;

    const net: Record<string, number> = {};
    for (const p of round.players)
      net[p.id] = Math.round(((totals[p.id] ?? 0) - (prev[p.id] ?? 0)) * 100) / 100;

    out.push({ hole: h.number, net });
    prev = totals;
  }

  return out;
}

function highwayRobbery(round: Round): Award | null {
  if (!computeSettlement(round).active) return null;

  let best: { playerId: string; hole: number; amount: number } | null = null;

  for (const { hole, net } of moneyByHole(round)) {
    for (const p of round.players) {
      const amount = net[p.id] ?? 0;
      if (amount <= 0) continue;
      if (best == null || amount > best.amount) best = { playerId: p.id, hole, amount };
    }
  }

  if (!best) return null;

  return {
    id: 'highway-robbery',
    title: 'Highway Robbery',
    line: `${nameOf(round, best.playerId)} cleaned up on ${best.hole}`,
    detail: formatMoney(best.amount),
    playerIds: [best.playerId],
    score: 30 + 35 * Math.min(1, best.amount / moneySpread(round)),
  };
}

function sandbagger(round: Round): Award | null {
  if (!usesHandicaps(round)) return null;

  const par = round.holes.reduce((sum, h) => sum + h.par, 0);
  let best: { playerId: string; net: number; under: number } | null = null;

  for (const p of round.players) {
    // A partial card would flatter the player, so only complete rounds count.
    const strokes = round.holes.map((h) => round.scores[h.number]?.[p.id]);
    if (strokes.some((v) => v == null)) continue;

    const gross = strokes.reduce((sum: number, v) => sum + (v as number), 0);
    const net = gross - totalStrokesReceived(round, p.id);
    const under = par - net;
    if (under < 2) continue;
    if (best == null || under > best.under) best = { playerId: p.id, net, under };
  }

  if (!best) return null;

  return {
    id: 'sandbagger',
    title: 'Sandbagger',
    line: `${nameOf(round, best.playerId)} is playing off the wrong handicap`,
    detail: `${best.net} net · ${best.under} under par`,
    playerIds: [best.playerId],
    score: Math.min(35 + best.under * 3, 65),
  };
}

function skinThief(round: Round): Award | null {
  if (!round.games.includes('skins')) return null;

  const counts = computeSkins(round)
    .standings.filter((s) => s.playerId)
    .sort((a, b) => b.value - a.value);

  const top = counts[0];
  if (!top || top.value < 2) return null;
  if (counts[1] && counts[1].value === top.value) return null; // a split pot is nobody's heist

  return {
    id: 'skin-thief',
    title: 'Skin Thief',
    line: `${top.label} walked off with the pot`,
    detail: `${top.value} skins`,
    playerIds: [top.playerId!],
    score: Math.min(30 + top.value * 5, 60),
  };
}

function wolfsGamble(round: Round): Award | null {
  if (!round.games.includes('wolf')) return null;

  // Only the solo bets are a gamble; a partner hole is just golf.
  const gambles = wolfOutcomes(round)
    .filter((o) => o.choice !== 'partner' && o.result !== 'push')
    .sort((a, b) => b.multiplier - a.multiplier || (a.result === 'won' ? -1 : 1));

  const g = gambles[0];
  if (!g) return null;

  const label = g.choice === 'blind' ? 'blind wolf' : 'lone wolf';
  const won = g.result === 'won';

  return {
    id: 'wolfs-gamble',
    title: "Wolf's Gamble",
    line: `${nameOf(round, g.wolfId)} rolled the dice on ${g.hole} and ${
      won ? 'got away with it' : 'got eaten'
    }`,
    detail: won ? `${label} · +${g.multiplier} pts` : `${label} · fed the pack`,
    playerIds: [g.wolfId],
    score: 45 + g.multiplier * 7,
  };
}

/**
 * Someone who never won a single hole's money. `excludeId` is the ATM, kept
 * out so the two money roasts land on different people rather than piling
 * onto whoever already paid for everyone's round.
 */
function shutOut(round: Round, excludeId: string | undefined): Award | null {
  if (!computeSettlement(round).active) return null;

  const byHole = moneyByHole(round);
  const holesWon: Record<string, number> = {};
  for (const p of round.players)
    holesWon[p.id] = byHole.filter((h) => (h.net[p.id] ?? 0) > 0).length;

  const settlement = computeSettlement(round);
  const empty = round.players
    .filter((p) => p.id !== excludeId && holesWon[p.id] === 0)
    .map((p) => ({ id: p.id, net: settlement.totals[p.id] ?? 0 }))
    .filter((x) => x.net < 0)
    .sort((a, b) => a.net - b.net);

  const target = empty[0];
  if (!target) return null;

  return {
    id: 'shut-out',
    title: 'Shut Out',
    line: `${nameOf(round, target.id)} never got one back`,
    detail: '0 holes won',
    playerIds: [target.id],
    score: 28 + (20 * Math.abs(target.net)) / moneySpread(round),
  };
}

export function computeAwards(round: Round): Award[] {
  const theAtm = atm(round);
  const candidates = [
    shotOfTheDay(round),
    snowman(round),
    bounceBack(round),
    theAtm,
    highwayRobbery(round),
    sandbagger(round),
    skinThief(round),
    wolfsGamble(round),
    shutOut(round, theAtm?.playerIds[0]),
  ];
  const ranked = candidates
    .filter((a): a is Award => a !== null)
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));

  // Take the best few, but never let one hot round crowd everyone else off
  // the card — the point is that the whole group gets ribbed.
  const taken: Award[] = [];
  const perPlayer: Record<string, number> = {};

  for (const award of ranked) {
    if (taken.length === MAX_AWARDS) break;
    if (award.playerIds.some((id) => (perPlayer[id] ?? 0) >= MAX_PER_PLAYER)) continue;
    award.playerIds.forEach((id) => (perPlayer[id] = (perPlayer[id] ?? 0) + 1));
    taken.push(award);
  }

  return taken;
}
