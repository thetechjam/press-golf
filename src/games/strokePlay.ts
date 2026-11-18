import type { Round, Hole, GameResult, GameStanding } from '../types';
import { strokesReceivedOver } from './handicap';
import { netFor } from './scoring';
import { rankPlayed, rankStandings } from './util';
import { zeroNet, type MoneyFn } from './moneyModels';

/** One player's card: gross, the figure it ranks on, and how many holes it has. */
function cardOf(round: Round, id: string, useNet: boolean) {
  let gross = 0;
  const played: Hole[] = [];
  for (const h of round.holes) {
    const s = round.scores[h.number]?.[id];
    if (s != null) {
      gross += s;
      played.push(h);
    }
  }
  // Only the strokes that fall on holes already scored. Taking the whole
  // round's strokes off half a card made an 18-handicap through nine look
  // nine shots better than the scratch player level with them.
  const net = useNet ? gross - strokesReceivedOver(round, id, played, 'strokePlay') : gross;
  return { gross, net, total: useNet ? net : gross, played: played.length };
}

/**
 * The owner's rule: once the round is finished, a card with a blank hole is
 * short and is disqualified from the money. Totals are over the holes scored,
 * so a skipped hole is a hole's worth of strokes the card never carried — left
 * in, the short card led and took the stake. While the round is in progress a
 * blank is just a hole not played yet, and every card is still in it.
 */
const isShort = (round: Round, played: number): boolean =>
  round.status === 'finished' && played > 0 && played < round.holes.length;

export function computeStrokePlay(round: Round): GameResult {
  const useNet = netFor(round, 'strokePlay');
  const finished = round.status === 'finished';
  const shortIds = new Set<string>();
  const blankIds = new Set<string>();

  const standings: GameStanding[] = round.players.map((p) => {
    const { gross, net, total, played } = cardOf(round, p.id, useNet);
    if (played === 0) blankIds.add(p.id);
    const base = played === 0 ? '—' : useNet ? `${net} net (${gross})` : `${gross}`;
    let detail = base;
    if (isShort(round, played)) {
      shortIds.add(p.id);
      // Worded as Play's own warning is ("2 holes are missing scores").
      const missing = round.holes.length - played;
      detail = `${base} · ${missing} ${missing === 1 ? 'hole' : 'holes'} missing`;
    }
    return { playerId: p.id, label: p.name, detail, value: total, rank: 0, isLeader: false };
  });

  const anyScores = round.players.some((p) =>
    round.holes.some((h) => round.scores[h.number]?.[p.id] != null)
  );

  const complete = (s: GameStanding) => !blankIds.has(s.playerId!) && !shortIds.has(s.playerId!);
  let sorted: GameStanding[];
  if (!finished || shortIds.size === 0) {
    // A player with no scores yet has no figure to rank — ranked on the 0
    // they would otherwise carry they led stroke play before anyone else had
    // teed off, and quota once the field was under pace. Last, and not a leader.
    sorted = rankPlayed(round, standings, true);
  } else {
    // Complete cards first, ranked among themselves; short cards after them
    // however low their totals, and never the leader.
    const full = rankStandings(standings.filter(complete), true);
    // A lone complete card has nobody level to tie with, so rankStandings
    // sees no spread — but it has beaten every short card, and leads.
    if (full.length === 1) full[0].isLeader = true;
    const rest = rankPlayed(
      round,
      standings.filter((s) => !complete(s)),
      true
    );
    for (const s of rest) {
      s.rank += full.length;
      s.isLeader = false;
    }
    sorted = [...full, ...rest];
  }
  const leader = sorted.find((s) => s.isLeader);
  const anyComplete = sorted.some(complete);

  return {
    gameType: 'strokePlay',
    title: useNet ? 'Stroke Play (Net)' : 'Stroke Play',
    status: !anyScores
      ? 'No scores yet'
      : leader
        ? `${leader.label} leads · ${leader.detail}`
        : finished && !anyComplete
          ? 'No complete card'
          : 'All square',
    standings: sorted,
  };
}

/**
 * Low round takes the stake from every other player who posted a card; a tie
 * for low splits the pot. Totals are over the holes each player scored, as
 * computeStrokePlay counts them.
 *
 * On a finished round only a complete card can win or share the pot. A short
 * card still posted a card, so it pays like any other card that lost: let off,
 * skipping a hole would be the way out of a losing bet. With no complete card
 * nobody won, and nothing moves.
 */
export const strokePlayMoney: MoneyFn = (round, stake) => {
  const net = zeroNet(round);
  const useNet = netFor(round, 'strokePlay');
  const totals = round.players
    .map((p) => ({ id: p.id, ...cardOf(round, p.id, useNet) }))
    .filter((t) => t.played > 0);
  if (totals.length < 2) return net;
  const eligible = totals.filter((t) => !isShort(round, t.played));
  if (eligible.length === 0) return net;
  const min = Math.min(...eligible.map((t) => t.total));
  const winners = eligible.filter((t) => t.total === min);
  const losers = totals.filter((t) => !winners.includes(t));
  if (losers.length === 0) return net;
  const share = (losers.length * stake) / winners.length;
  winners.forEach((w) => (net[w.id] = share));
  losers.forEach((l) => (net[l.id] = -stake));
  return net;
};
