import type { Round } from '../types';
import { computeSettlement, formatMoney } from './settlement';
import { totalStrokesReceived, usesHandicaps } from './handicap';
import { computeSkins } from './skins';
import { wolfOutcomes } from './wolf';
import { vegasHoles, vegasTeams, vegasReady } from './vegas';
import { computeQuota } from './quota';

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
  /**
   * The hole this award reports a score on, where it reports one.
   *
   * Set it on any award that is fundamentally "this player wrote this number
   * on this hole" — two of those about the same player and hole are the same
   * fact told twice, and `computeAwards` keeps only the better-ranked one. An
   * award about a hole for a different reason (what the hole paid, say) can
   * leave it unset and sit happily beside the score that earned it.
   */
  hole?: number;
}

/** How many awards a round shows, and how many any one player may take. */
const MAX_AWARDS = 4;
const MAX_PER_PLAYER = 2;

const nameOf = (round: Round, id: string) =>
  round.players.find((p) => p.id === id)?.name ?? '';

/**
 * A hole as golfers name one: 1 -> 'the 1st', 12 -> 'the 12th'.
 *
 * The bare number was ambiguous in exactly the lines that had no preposition
 * in front of it — "Jo birdied 1" reads as one birdie as easily as the first
 * hole, and the detail line under it ("3 on a par 4") does nothing to settle
 * it. Applied to every hole in these lines rather than only the two that were
 * ambiguous, because half the awards speaking golf and half reading out
 * coordinates is worse than either.
 */
export function holeName(n: number): string {
  const teens = n % 100;
  const suffix =
    teens >= 11 && teens <= 13
      ? 'th'
      : n % 10 === 1
        ? 'st'
        : n % 10 === 2
          ? 'nd'
          : n % 10 === 3
            ? 'rd'
            : 'th';
  return `the ${n}${suffix}`;
}

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
    line: `${nameOf(round, best.playerId)} ${underParVerb(best.under)} ${holeName(best.hole)}`,
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
    line: `${nameOf(round, worst.playerId)} found trouble on ${holeName(worst.hole)}`,
    detail: `${worst.strokes} on a par ${worst.par} · +${worst.over}`,
    playerIds: [worst.playerId],
    score: 30 + worst.over * 8,
    hole: worst.hole,
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
    line: `${nameOf(round, best.playerId)} answered ${holeName(best.badHole)} with ${underParNoun(best.under)}`,
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
    line: `${nameOf(round, best.playerId)} cleaned up on ${holeName(best.hole)}`,
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
    line: `${nameOf(round, g.wolfId)} rolled the dice on ${holeName(g.hole)} and ${
      won ? 'got away with it' : 'got eaten'
    }`,
    detail: won ? `${label} · +${g.multiplier} pts` : `${label} · fed the pack`,
    playerIds: [g.wolfId],
    score: 45 + g.multiplier * 7,
  };
}

/**
 * The hole where one side's number blew up, and the player who blew it up.
 *
 * Vegas's whole character is that a bad hole costs a hundred rather than one,
 * so the biggest single swing is the story of the round — and it belongs to a
 * person, not a team: the higher score on the losing side is the one that made
 * their number enormous. A partner who played their part gets left out of it.
 *
 * Twenty points is the threshold because ordinary holes swing single figures:
 * 45 against 56 is 11. Reaching twenty takes a genuine wreck.
 */
function wreckingBall(round: Round): Award | null {
  if (!round.games.includes('vegas') || !vegasReady(round)) return null;

  const worst = [...vegasHoles(round).holes].sort(
    (x, y) => Math.abs(y.swing) - Math.abs(x.swing)
  )[0];
  if (!worst || Math.abs(worst.swing) < 20) return null;

  const { a, b } = vegasTeams(round);
  const losers = worst.swing > 0 ? b : a;
  const hole = round.holes.find((h) => h.number === worst.hole);
  if (!hole) return null;

  // The bigger score is the one that made the number what it is.
  const culprit = losers.ids
    .map((id) => ({ id, strokes: round.scores[worst.hole]?.[id] }))
    .filter((x): x is { id: string; strokes: number } => x.strokes != null)
    .sort((x, y) => y.strokes - x.strokes)[0];
  if (!culprit) return null;

  const cost = Math.abs(worst.swing);

  return {
    id: 'wrecking-ball',
    title: 'The Wrecking Ball',
    line: `${nameOf(round, culprit.id)} turned ${holeName(worst.hole)} into a phone number`,
    detail: `${culprit.strokes} on a par ${hole.par} · ${cost} points`,
    playerIds: [culprit.id],
    // Ranked on what the hole cost, because in Vegas that *is* the severity —
    // it already encodes how bad the score was. Allowed to run above The
    // Snowman's range on purpose: when both describe the same hole only one
    // survives, and this one says everything that one says plus the damage.
    score: Math.min(35 + cost, 85),
    hole: worst.hole,
  };
}

/**
 * Whoever finished furthest below the target Quota set them.
 *
 * Deliberately the miss rather than the beat: Sandbagger already rewards
 * someone for playing under their handicap, and a Quota round uses handicaps,
 * so an award for clearing the number would land on the same player twice for
 * the same reason.
 */
function shortOfTheMark(round: Round): Award | null {
  if (!round.games.includes('quota')) return null;

  const standings = computeQuota(round)
    .standings.filter((s) => s.playerId)
    .sort((x, y) => x.value - y.value);

  const worst = standings[0];
  if (!worst || worst.value > -6) return null;
  // A shared low is nobody's in particular.
  if (standings[1] && standings[1].value === worst.value) return null;

  const short = Math.abs(worst.value);

  return {
    id: 'short-of-the-mark',
    title: 'Short of the Mark',
    line: `${worst.label} never got near the number`,
    detail: `${worst.detail} · ${short} short`,
    playerIds: [worst.playerId!],
    score: Math.min(30 + short * 2, 60),
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
    wreckingBall(round),
    shortOfTheMark(round),
    shutOut(round, theAtm?.playerIds[0]),
  ];
  const ranked = candidates
    .filter((a): a is Award => a !== null)
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));

  // Take the best few, but never let one hot round crowd everyone else off
  // the card — the point is that the whole group gets ribbed.
  const taken: Award[] = [];
  const perPlayer: Record<string, number> = {};
  // Holes already reported as somebody's score. A blow-up that also wrecked a
  // Vegas number is one hole, and naming it twice reads as a bug rather than
  // as two jokes — the better-ranked telling wins.
  const reported = new Set<string>();

  for (const award of ranked) {
    if (taken.length === MAX_AWARDS) break;
    if (award.playerIds.some((id) => (perPlayer[id] ?? 0) >= MAX_PER_PLAYER)) continue;

    const keys = award.hole == null ? [] : award.playerIds.map((id) => `${id}@${award.hole}`);
    if (keys.some((k) => reported.has(k))) continue;
    keys.forEach((k) => reported.add(k));

    award.playerIds.forEach((id) => (perPlayer[id] = (perPlayer[id] ?? 0) + 1));
    taken.push(award);
  }

  return taken;
}
