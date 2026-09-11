import type { Round, Hole, GameResult, GameStanding } from '../types';
import { holeScore } from './handicap';
import { netFor } from './scoring';
import { resolveSides, type Side } from './matchPlay';

/**
 * Vegas — the two-on-two game where a team's score is not added but written
 * down side by side.
 *
 * Each side's two scores become a single number, the lower one first: a 4 and
 * a 5 is 45, not 9. The lower number wins the hole and the margin between them
 * is the points swing, so one blow-up does not cost a hole — it costs a
 * hundred. That is the whole appeal, and it is why a 6 next to a 4 (46) is
 * survivable while a 4 next to a 6 would not be.
 *
 * The flip is the other half of the game: a birdie by one side turns the
 * other side's number around, 45 becoming 54. Not every group plays it, so it
 * is a setup option rather than a rule baked in here.
 */

/** Resolves the two Vegas sides — always the 2v2 teams chosen at setup. */
export function vegasTeams(round: Round): { a: Side; b: Side } {
  return resolveSides(round, round.options.vegas);
}

/**
 * The two scores written as one number, lowest first.
 *
 * Built by concatenating the digits rather than by `lo * 10 + hi`, because a
 * score can reach double figures: a 5 and a 10 is played as 510, which is the
 * number a group would actually write on the card, and arithmetic would have
 * made it 105 — a number that wins holes it should lose.
 */
export function vegasNumber(lo: number, hi: number, flipped: boolean): number {
  const [first, second] = flipped ? [hi, lo] : [lo, hi];
  return Number(`${first}${second}`);
}

/** True when a side made at least a birdie on the hole — what triggers a flip. */
function hasBirdie(scores: number[], par: number): boolean {
  return scores.some((s) => s <= par - 1);
}

export interface VegasHole {
  hole: number;
  a: number;
  b: number;
  /** Points to side A on this hole; negative means side B took them. */
  swing: number;
  /**
   * Whether each side's number was turned around by the other side's birdie.
   * Carried so the board can say so: a player who wrote down a 4 and a 5 and
   * sees 54 has been handed what looks like a bug unless the flip is named.
   */
  aFlipped: boolean;
  bFlipped: boolean;
}

/** Per-hole detail plus the running margin, shared by the board and the money. */
export function vegasHoles(round: Round): { holes: VegasHole[]; margin: number } {
  const { a, b } = vegasTeams(round);
  const useNet = netFor(round, 'vegas');
  const flipOn = round.options.vegasFlip !== false;
  const holes: VegasHole[] = [];
  let margin = 0;

  const sideScores = (ids: string[], h: Hole): number[] | null => {
    const s = ids.map((id) => holeScore(round, id, h, useNet));
    return s.every((v): v is number => v != null) ? s : null;
  };

  for (const h of round.holes) {
    const sa = sideScores(a.ids, h);
    const sb = sideScores(b.ids, h);
    // Every player on both sides must be in before a hole can be valued —
    // a missing fourth ball would otherwise be scored as a two-digit number
    // against a rival's, which is not a smaller score but a different game.
    if (!sa || !sb || sa.length < 2 || sb.length < 2) continue;

    const aFlipped = flipOn && hasBirdie(sb, h.par);
    const bFlipped = flipOn && hasBirdie(sa, h.par);
    const av = vegasNumber(Math.min(...sa), Math.max(...sa), aFlipped);
    const bv = vegasNumber(Math.min(...sb), Math.max(...sb), bFlipped);

    const swing = bv - av; // + = side A won the hole by that many points
    margin += swing;
    holes.push({ hole: h.number, a: av, b: bv, swing, aFlipped, bFlipped });
  }

  return { holes, margin };
}

/**
 * This hole's numbers, or null while a ball is still out.
 *
 * The Hole tab needs one hole; everything else needs the whole run. Walking
 * the round for one entry is nothing at this size, and keeps a single place
 * where a hole is valued.
 */
export function vegasHoleFor(round: Round, holeNumber: number): VegasHole | null {
  return vegasHoles(round).holes.find((h) => h.hole === holeNumber) ?? null;
}

/** True when this round is actually set up to play Vegas. */
export function vegasReady(round: Round): boolean {
  return round.players.length >= 4 && round.options.vegas?.mode === '2v2';
}

export function computeVegas(round: Round): GameResult {
  const { a, b } = vegasTeams(round);

  if (!vegasReady(round)) {
    return {
      gameType: 'vegas',
      title: 'Vegas',
      status: 'Needs two teams of 2',
      standings: [],
      note: 'Pick 2 v 2 teams at setup to start this game.',
    };
  }

  const { holes, margin } = vegasHoles(round);
  const leaderIsA = margin > 0;
  const lead = Math.abs(margin);

  const side = (label: string, value: number): GameStanding => ({
    label,
    detail: `${value > 0 ? '+' : ''}${value} pts`,
    value,
    // Level is a tie for first, not a first and a second.
    rank: margin === 0 ? 1 : value > 0 ? 1 : 2,
    isLeader: margin !== 0 && value > 0,
  });

  const standings: GameStanding[] = [side(a.label, margin), side(b.label, -margin)];
  // The side that is up goes on top; at all square the teams keep the order
  // they were picked in, rather than swapping for no reason each render.
  if (margin < 0) standings.reverse();

  const status =
    holes.length === 0
      ? 'No holes completed'
      : margin === 0
        ? 'All square'
        : `${leaderIsA ? a.label : b.label} up ${lead}`;

  const last = holes[holes.length - 1];

  return {
    gameType: 'vegas',
    title: netFor(round, 'vegas') ? 'Vegas (Net)' : 'Vegas',
    status,
    standings,
    note: last ? `Hole ${last.hole}: ${last.a} to ${last.b}` : undefined,
  };
}
