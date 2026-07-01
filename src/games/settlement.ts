import type { Round, GameType } from '../types';
import { computeSkins } from './skins';
import { computeStableford } from './stableford';
import { computeWolf } from './wolf';
import { matchSegment, matchSegmentSides } from './matchPlay';
import { nassauSegments, nassauTeams } from './nassau';
import { totalStrokesReceived } from './handicap';

export interface Transaction {
  from: string; // debtor name
  to: string; // creditor name
  amount: number;
}

export interface GameMoney {
  gameType: GameType;
  label: string;
  unit: string;
  stake: number;
  net: Record<string, number>; // playerId -> dollars (zero-sum)
}

export interface Settlement {
  active: boolean; // any stake > 0
  totals: Record<string, number>; // playerId -> net dollars
  perGame: GameMoney[];
  transactions: Transaction[];
}

const LABEL: Record<GameType, string> = {
  strokePlay: 'Stroke Play',
  matchPlay: 'Match Play',
  skins: 'Skins',
  stableford: 'Stableford',
  wolf: 'Wolf',
  nassau: 'Nassau',
};

export const STAKE_UNIT: Record<GameType, string> = {
  strokePlay: 'low round',
  matchPlay: 'the match',
  skins: 'skin',
  stableford: 'point',
  wolf: 'point',
  nassau: 'bet (×3)',
};

export function formatMoney(n: number): string {
  const abs = Math.abs(n);
  const s = Number.isInteger(abs) ? `$${abs}` : `$${abs.toFixed(2)}`;
  return n < 0 ? `−${s}` : s;
}

/** Field-difference model: each unit shifts `stake` between you and every rival. */
function fieldNet(
  ids: string[],
  valueById: Record<string, number>,
  stake: number
): Record<string, number> {
  const n = ids.length;
  const total = ids.reduce((a, id) => a + (valueById[id] ?? 0), 0);
  const net: Record<string, number> = {};
  ids.forEach((id) => (net[id] = stake * (n * (valueById[id] ?? 0) - total)));
  return net;
}

function gameNet(round: Round, gameType: GameType, stake: number): Record<string, number> {
  const ids = round.players.map((p) => p.id);
  const net: Record<string, number> = {};
  ids.forEach((id) => (net[id] = 0));
  if (stake <= 0) return net;

  if (gameType === 'skins' || gameType === 'stableford' || gameType === 'wolf') {
    const res =
      gameType === 'skins'
        ? computeSkins(round)
        : gameType === 'stableford'
          ? computeStableford(round)
          : computeWolf(round);
    const valueById: Record<string, number> = {};
    res.standings.forEach((s) => {
      if (s.playerId) valueById[s.playerId] = s.value;
    });
    return fieldNet(ids, valueById, stake);
  }

  if (gameType === 'strokePlay') {
    const useNet = round.options.useNet;
    const totals = ids
      .map((id) => {
        let gross = 0;
        let played = 0;
        for (const h of round.holes) {
          const s = round.scores[h.number]?.[id];
          if (s != null) {
            gross += s;
            played += 1;
          }
        }
        const total = useNet ? gross - totalStrokesReceived(round, id) : gross;
        return { id, total, played };
      })
      .filter((t) => t.played > 0);
    if (totals.length < 2) return net;
    const min = Math.min(...totals.map((t) => t.total));
    const winners = totals.filter((t) => t.total === min);
    const losers = totals.filter((t) => t.total > min);
    const share = (losers.length * stake) / winners.length;
    winners.forEach((w) => (net[w.id] = share));
    losers.forEach((l) => (net[l.id] = -stake));
    return net;
  }

  if (gameType === 'matchPlay') {
    if (round.players.length < 2) return net;
    const [p1, p2] = round.players;
    const seg = matchSegment(round, round.holes, p1, p2);
    if (seg.winner === 'A') {
      net[p1.id] = stake;
      net[p2.id] = -stake;
    } else if (seg.winner === 'B') {
      net[p2.id] = stake;
      net[p1.id] = -stake;
    }
    return net;
  }

  if (gameType === 'nassau') {
    if (round.players.length < 2) return net;
    // Each bet is worth `stake` per player: winning side collects, losing side pays.
    const { a, b } = nassauTeams(round);
    for (const seg of nassauSegments(round)) {
      const r = matchSegmentSides(round, seg.holes, a, b);
      if (r.winner === 'A') {
        a.ids.forEach((id) => (net[id] += stake));
        b.ids.forEach((id) => (net[id] -= stake));
      } else if (r.winner === 'B') {
        b.ids.forEach((id) => (net[id] += stake));
        a.ids.forEach((id) => (net[id] -= stake));
      }
    }
    return net;
  }

  return net;
}

/** Greedy minimum-transaction settlement from net balances. */
function settleTransactions(
  totals: Record<string, number>,
  nameById: Record<string, string>
): Transaction[] {
  const creditors = Object.entries(totals)
    .filter(([, v]) => v > 0.005)
    .map(([id, v]) => ({ id, v }))
    .sort((a, b) => b.v - a.v);
  const debtors = Object.entries(totals)
    .filter(([, v]) => v < -0.005)
    .map(([id, v]) => ({ id, v: -v }))
    .sort((a, b) => b.v - a.v);

  const tx: Transaction[] = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const amount = Math.min(debtors[i].v, creditors[j].v);
    tx.push({
      from: nameById[debtors[i].id],
      to: nameById[creditors[j].id],
      amount: Math.round(amount * 100) / 100,
    });
    debtors[i].v -= amount;
    creditors[j].v -= amount;
    if (debtors[i].v <= 0.005) i += 1;
    if (creditors[j].v <= 0.005) j += 1;
  }
  return tx;
}

export function computeSettlement(round: Round): Settlement {
  const ids = round.players.map((p) => p.id);
  const nameById: Record<string, string> = {};
  round.players.forEach((p) => (nameById[p.id] = p.name));

  const totals: Record<string, number> = {};
  ids.forEach((id) => (totals[id] = 0));
  const perGame: GameMoney[] = [];

  for (const gt of round.games) {
    const stake = round.options.stakes?.[gt] ?? 0;
    if (stake <= 0) continue;
    const net = gameNet(round, gt, stake);
    perGame.push({ gameType: gt, label: LABEL[gt], unit: STAKE_UNIT[gt], stake, net });
    ids.forEach((id) => (totals[id] += net[id]));
  }

  return {
    active: perGame.length > 0,
    totals,
    perGame,
    transactions: settleTransactions(totals, nameById),
  };
}
