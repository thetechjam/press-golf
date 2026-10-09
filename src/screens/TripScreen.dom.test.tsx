// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Round } from '../types';
import { TripScreen, tripDates } from './TripScreen';
import { Home } from './Home';
import { Setup } from './Setup';
import { listRounds } from '../storage';
import { makeRound, player, holes, scoresFrom } from '../games/testFixtures';

/**
 * Trip mode on screen. The adding up is tested in `trips.test.ts`; here is
 * what a screen adds: one set of payments for the whole trip, rounds put on
 * and taken off it, a rename that reaches every round, and the ways in from
 * Home and New Round.
 */

const TRIP = { id: 't1', name: "Myrtle '27" };
const today = new Date().toISOString().slice(0, 10);

/** $5 skins; whoever alone has the lowest card takes all nine skins. */
function round(id: string, cards: Record<string, number>, over: Partial<Round> = {}): Round {
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
  return { ...r, id, date: today, updatedAt: Date.now(), course: `Course ${id}`, trip: TRIP, ...over };
}

const store = (rounds: Round[]) => localStorage.setItem('press.rounds.v1', JSON.stringify(rounds));
const show = (onOpenRound: (r: Round) => void = () => {}) =>
  render(<TripScreen tripId="t1" onBack={() => {}} onOpenRound={onOpenRound} />);

beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe('Trip screen', () => {
  it('settles the whole trip with one set of payments', () => {
    store([
      round('a', { Al: 3, Bo: 5, Cy: 5 }), // Al +90, Bo −45, Cy −45
      round('b', { Al: 5, Bo: 3, Cy: 5 }), // Bo +90, Al −45, Cy −45
    ]);
    show();
    const payments = [...document.querySelectorAll('.payment')].map((p) => p.textContent);
    expect(payments).toEqual(['Cy pays Al$45', 'Cy pays Bo$45']);
    expect(document.querySelector('.trip-meta')?.textContent).toMatch(/^2 rounds/);
  });

  it('opens a player’s total out into the rounds behind it', async () => {
    const user = userEvent.setup();
    store([
      round('a', { Al: 3, Bo: 5, Cy: 5 }), // Al +90
      round('b', { Al: 5, Bo: 3, Cy: 5 }), // Al −45
    ]);
    show();
    expect(document.querySelector('.net-breakdown')).toBeNull();
    await user.click(screen.getByRole('button', { name: /^Al/ }));
    const lines = [...document.querySelectorAll('.net-breakdown li')].map((li) => li.textContent);
    expect(lines).toHaveLength(2);
    expect(lines.join(' ')).toContain('Course a');
    expect(lines.join(' ')).toContain('$90');
    expect(lines.join(' ')).toContain('−$45');
  });

  it('renames the trip on every round', async () => {
    const user = userEvent.setup();
    store([round('a', { Al: 3, Bo: 5 }), round('b', { Al: 5, Bo: 3 })]);
    show();
    await user.click(screen.getByRole('button', { name: 'Rename' }));
    const input = screen.getByLabelText('Trip name');
    await user.clear(input);
    await user.type(input, 'Myrtle Beach');
    await user.click(screen.getByRole('button', { name: 'Save name' }));
    expect(listRounds().map((r) => r.trip?.name)).toEqual(['Myrtle Beach', 'Myrtle Beach']);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Myrtle Beach');
  });

  it('puts a nearby round on the trip and takes it off again', async () => {
    const user = userEvent.setup();
    store([round('a', { Al: 3, Bo: 5 }), round('b', { Al: 5, Bo: 3 }, { trip: undefined })]);
    show();
    await user.click(screen.getByRole('button', { name: 'Add or remove' }));
    const b = screen.getByRole('button', { name: /Course b/ });
    expect(b.getAttribute('aria-pressed')).toBe('false');
    await user.click(b);
    expect(listRounds().find((r) => r.id === 'b')?.trip).toEqual(TRIP);
    await user.click(screen.getByRole('button', { name: /Course b/ }));
    expect(listRounds().find((r) => r.id === 'b')?.trip).toBeUndefined();
  });

  it('will not take the last round off a trip', async () => {
    const user = userEvent.setup();
    store([round('a', { Al: 3, Bo: 5 })]);
    show();
    await user.click(screen.getByRole('button', { name: 'Add or remove' }));
    expect((screen.getByRole('button', { name: /Course a/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('opens a round from the list', async () => {
    const user = userEvent.setup();
    const opened: string[] = [];
    store([round('a', { Al: 3, Bo: 5 })]);
    show((r) => opened.push(r.id));
    const list = document.querySelector('.trip-rounds') as HTMLElement;
    await user.click(within(list).getByRole('button', { name: /Course a/ }));
    expect(opened).toEqual(['a']);
  });

  it('writes the trip’s dates as one short range', () => {
    const now = new Date(2027, 5, 1);
    expect(tripDates('2027-04-01', '2027-04-03', now)).toMatch(/^Apr 1–3$/);
    expect(tripDates('2027-04-30', '2027-05-02', now)).toMatch(/^Apr 30 – May 2$/);
    expect(tripDates('2026-04-01', '2026-04-01', now)).toMatch(/^Apr 1, 2026$/);
  });
});

describe('one person under two names', () => {
  it('asks above the payments, and merging settles them as one', async () => {
    const user = userEvent.setup();
    store([round('a', { Alex: 3, Bo: 5 }), round('b', { Al: 5, Bo: 3 })]);
    show();
    expect(document.querySelector('.same-person')?.textContent).toContain('might be the same person');
    expect(document.querySelectorAll('.net-row')).toHaveLength(3);
    await user.click(screen.getByRole('button', { name: /Same person/ }));
    expect(document.querySelector('.same-person')).toBeNull();
    expect(document.querySelectorAll('.net-row')).toHaveLength(2);
  });

  it('"two people" is remembered', async () => {
    const user = userEvent.setup();
    store([round('a', { Alex: 3, Bo: 5 }), round('b', { Al: 5, Bo: 3 })]);
    show();
    await user.click(screen.getByRole('button', { name: 'Two people' }));
    cleanup();
    show();
    expect(document.querySelector('.same-person')).toBeNull();
  });
});

describe('the ways in', () => {
  const homeProps = {
    onNew: () => {},
    onNewLeague: () => {},
    onResume: () => {},
    onViewResults: () => {},
    onStats: () => {},
    onHistory: () => {},
  };

  it('puts the trip being played on Home, and opens it', async () => {
    const user = userEvent.setup();
    const opened: string[] = [];
    store([round('a', { Al: 3, Bo: 5 })]);
    render(<Home {...homeProps} onTrip={(id) => opened.push(id)} />);
    const card = document.querySelector('.trip-card') as HTMLElement;
    expect(card.textContent).toContain("Myrtle '27");
    expect(card.textContent).toContain('Al up $45');
    await user.click(card);
    expect(opened).toEqual(['t1']);
  });

  it('leaves an old trip off Home', () => {
    // Played a month ago; that it was edited today does not bring it back.
    store([round('a', { Al: 3, Bo: 5 }, { date: '2026-01-10', updatedAt: Date.now() })]);
    render(<Home {...homeProps} onTrip={() => {}} />);
    expect(document.querySelector('.trip-card')).toBeNull();
  });

  it('starts a new round on the trip being played', async () => {
    const user = userEvent.setup();
    const started: Round[] = [];
    store([round('a', { Al: 3, Bo: 5 })]);
    render(<Setup onCancel={() => {}} onStart={(r) => started.push(r)} />);
    expect(screen.getByRole('button', { name: /Trip/ }).textContent).toContain("Myrtle '27");
    await user.type(screen.getByPlaceholderText('Player 1'), 'Al');
    await user.type(screen.getByPlaceholderText('Player 2'), 'Bo');
    await user.click(screen.getByRole('button', { name: /Start Round/ }));
    expect(started[0]?.trip).toEqual(TRIP);
  });

  it('starts a new trip from New Round', async () => {
    const user = userEvent.setup();
    const started: Round[] = [];
    render(<Setup onCancel={() => {}} onStart={(r) => started.push(r)} />);
    await user.click(screen.getByRole('button', { name: /Trip/ }));
    await user.click(screen.getByRole('button', { name: '+ New trip' }));
    await user.type(screen.getByLabelText('Trip name'), 'Pinehurst');
    await user.type(screen.getByPlaceholderText('Player 1'), 'Al');
    await user.type(screen.getByPlaceholderText('Player 2'), 'Bo');
    await user.click(screen.getByRole('button', { name: /Start Round/ }));
    expect(started[0]?.trip?.name).toBe('Pinehurst');
    expect(started[0]?.trip?.id).toBeTruthy();
  });
});
