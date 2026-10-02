import { describe, it, expect } from 'vitest';
import type { Round } from './types';
import { activeTrip, findTrip, listTrips, tripLedger, withTrip, ACTIVE_TRIP_DAYS } from './trips';
import { computeSettlement } from './games/settlement';
import { makeRound, player, holes, scoresFrom } from './games/testFixtures';
import { packRound, unpackRound } from './shareLink';

const MYRTLE = { id: 't1', name: "Myrtle '27" };
const DAY = 864e5;

/**
 * A skins round at $5 a skin. `cards` gives each named player one score for
 * every hole, so whoever is alone at the lowest score wins all nine skins.
 */
function round(
  id: string,
  date: string,
  cards: Record<string, number>,
  over: Partial<Round> = {}
): Round {
  const hs = holes(9);
  const ps = Object.keys(cards).map((name, i) => player(`${id}-${i}`, name));
  const per: Record<string, number[]> = {};
  ps.forEach((p) => (per[p.id] = Array(9).fill(cards[p.name])));
  const r = makeRound({
    players: ps,
    holes: hs,
    games: ['skins'],
    options: { stakes: { skins: 5 } },
    scores: scoresFrom(hs, per),
    status: 'finished',
  });
  return { ...r, id, date, trip: MYRTLE, ...over };
}

describe('trips', () => {
  it('groups rounds by trip, newest trip and newest round first', () => {
    const rounds = [
      round('a', '2027-04-01', { Al: 4, Bo: 5 }),
      round('b', '2027-04-02', { Al: 4, Bo: 5 }),
      round('c', '2026-09-01', { Al: 4, Bo: 5 }, { trip: { id: 't0', name: 'Vegas' } }),
      round('d', '2027-04-03', { Al: 4, Bo: 5 }, { trip: undefined }),
    ];
    const trips = listTrips(rounds);
    expect(trips.map((t) => t.name)).toEqual(["Myrtle '27", 'Vegas']);
    expect(trips[0].rounds.map((r) => r.id)).toEqual(['b', 'a']);
    expect(trips[0]).toMatchObject({ first: '2027-04-01', last: '2027-04-02' });
    expect(findTrip(rounds, 't0')?.rounds).toHaveLength(1);
  });

  it('takes the name from the most recently changed round', () => {
    const rounds = [
      round('a', '2027-04-01', { Al: 4 }, { updatedAt: 1 }),
      round('b', '2027-04-02', { Al: 4 }, { updatedAt: 2, trip: { id: 't1', name: 'Myrtle Beach' } }),
    ];
    expect(listTrips(rounds)[0].name).toBe('Myrtle Beach');
  });

  it('is active for a few days after its last round, then not', () => {
    const now = Date.UTC(2027, 3, 10);
    const r = round('a', '2027-04-08', { Al: 4 }, { updatedAt: now - DAY });
    expect(activeTrip([r], now)?.id).toBe('t1');
    const old = { ...r, updatedAt: now - (ACTIVE_TRIP_DAYS + 1) * DAY };
    expect(activeTrip([old], now)).toBeNull();
  });

  it('adds up money across rounds by name, and settles the sum once', () => {
    // Round 1: Al wins all 9 skins from Bo and Cy → Al +90, Bo −45, Cy −45.
    // Round 2: Bo wins all 9 → Bo +90, Al −45, Cy −45.
    const rounds = [
      round('a', '2027-04-01', { Al: 3, Bo: 5, Cy: 5 }),
      round('b', '2027-04-02', { Al: 5, Bo: 3, Cy: 5 }),
    ];
    const ledger = tripLedger(rounds);
    const total = (n: string) => ledger.players.find((p) => p.name === n)!.total;
    expect(total('Al')).toBe(45);
    expect(total('Bo')).toBe(45);
    expect(total('Cy')).toBe(-90);
    // Two payments where settling each round would have taken four.
    expect(ledger.transactions).toHaveLength(2);
    expect(ledger.transactions.every((t) => t.from === 'Cy')).toBe(true);
    expect(ledger.moneyRounds).toBe(2);
    // The per-round figures agree with each round's own settlement.
    const al = ledger.players.find((p) => p.name === 'Al')!;
    expect(al.byRound.a).toBe(computeSettlement(rounds[0]).totals['a-0']);
  });

  it('matches a player across rounds whatever case they were typed in', () => {
    const rounds = [
      round('a', '2027-04-01', { Al: 3, Bo: 5 }),
      round('b', '2027-04-02', { 'al ': 3, BO: 5 }),
    ];
    expect(tripLedger(rounds).players).toHaveLength(2);
  });

  it('counts unfinished rounds and leaves out rounds with no stake', () => {
    const noMoney = round('b', '2027-04-02', { Al: 3, Bo: 5 }, { options: makeRound().options });
    const live = round('c', '2027-04-03', { Al: 3, Bo: 5 }, { status: 'in_progress' });
    const ledger = tripLedger([round('a', '2027-04-01', { Al: 3, Bo: 5 }), noMoney, live]);
    expect(ledger.moneyRounds).toBe(2);
    expect(ledger.unfinished).toBe(1);
  });

  it('nets to zero, with no one-cent payments left over', () => {
    const rounds = ['a', 'b', 'c'].map((id, i) =>
      round(id, `2027-04-0${i + 1}`, { Al: 3 + (i % 2), Bo: 4, Cy: 5 - (i % 2) })
    );
    const ledger = tripLedger(rounds);
    const sum = ledger.players.reduce((s, p) => s + Math.round(p.total * 100), 0);
    expect(sum).toBe(0);
    expect(ledger.transactions.every((t) => t.amount >= 0.01)).toBe(true);
  });

  it('sets and clears a round’s trip', () => {
    const r = round('a', '2027-04-01', { Al: 4 });
    expect(withTrip(r, null).trip).toBeUndefined();
    expect(withTrip(r, { id: 't2', name: '  Pinehurst ' }).trip).toEqual({ id: 't2', name: 'Pinehurst' });
  });

  it('travels with a share link', () => {
    const packed = packRound(round('a', '2027-04-01', { Al: 4, Bo: 5 }));
    const back = unpackRound(JSON.parse(JSON.stringify(packed)));
    expect(back.ok && back.round.trip).toEqual(MYRTLE);
  });
});
