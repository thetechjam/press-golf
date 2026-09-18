// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Round } from '../types';
import { Stats } from './Stats';

/**
 * Narrowing the history the stats are drawn from.
 *
 * The searching, the year list and the empty sentence are all tested without a
 * DOM in `history.test.ts`, and the arithmetic in `stats.test.ts`. What is here
 * is what only exists on screen: that the figures move when a filter does,
 * that the pool being filtered is the same pool the figures came from, and that
 * chrome nobody can use does not appear.
 */

const holes = Array.from({ length: 18 }, (_, i) => ({
  number: i + 1,
  par: 4,
  strokeIndex: i + 1,
}));

/** Every hole scored, so the round counts however its status reads. */
const scoresFor = (ids: string[], strokes: number): Round['scores'] =>
  Object.fromEntries(
    holes.map((h) => [h.number, Object.fromEntries(ids.map((id) => [id, strokes]))])
  );

const round = (over: Partial<Round>): Round => {
  const players = over.players ?? [{ id: 'p1', name: 'Alex' }];
  return {
    id: 'r',
    course: 'Torrey Pines South',
    date: '2026-09-11',
    createdAt: 1,
    updatedAt: 1,
    holes,
    games: ['skins'],
    options: {
      useNet: false,
      stablefordMode: 'standard',
      loneWolfMultiplier: 2,
      blindWolfMultiplier: 3,
      stakes: {},
    },
    wolf: {},
    status: 'finished',
    ...over,
    players,
    scores: over.scores ?? scoresFor(players.map((p) => p.id), 4),
  };
};

const ROUNDS: Round[] = [
  round({ id: 'a', course: 'Torrey Pines South', date: '2026-09-11', updatedAt: 5 }),
  round({
    id: 'b',
    course: 'Pebble Beach',
    date: '2026-07-02',
    updatedAt: 4,
    players: [{ id: 'p1', name: 'Alex' }, { id: 'p2', name: 'Casey' }],
  }),
  round({ id: 'c', course: 'Muirfield', date: '2025-08-20', updatedAt: 3 }),
];

const names = () => [...document.querySelectorAll('.stat-name')].map((n) => n.textContent);
const summary = () => [...document.querySelectorAll('.stat-sum')].map((s) => s.textContent);
const years = () =>
  [...document.querySelectorAll('.stat-years .seg-btn')].map((b) => b.textContent);

const show = (rounds: Round[] = ROUNDS) => {
  localStorage.setItem('press.rounds.v1', JSON.stringify(rounds));
  return render(<Stats onBack={() => {}} />);
};

beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe('filtering the stats', () => {
  it('counts every counted round until something is filtered', () => {
    show();
    expect(summary()[0]).toContain('3');
    expect(names()).toEqual(['Alex', 'Casey']);
    // No count line while nothing is hidden — the summary tile is the count.
    expect(document.querySelector('.history-count')).toBeNull();
  });

  it('recomputes the figures from the rounds a search leaves', async () => {
    const user = userEvent.setup();
    show();

    await user.type(screen.getByLabelText('Search rounds'), 'pebble');
    expect(summary()[0]).toContain('1');
    expect(names()).toEqual(['Alex', 'Casey']);
    // The denominator is the counted history, so the line says what is hidden.
    expect(screen.getByText('1 of 3 rounds')).toBeTruthy();
    // And the footnote stops claiming every finished round on the device.
    expect(document.querySelector('.hint')?.textContent).toContain('the rounds shown above');
  });

  it('narrows to one player through their name', async () => {
    const user = userEvent.setup();
    show();

    await user.type(screen.getByLabelText('Search rounds'), 'casey');
    // The searched player only. Alex was on that card, but a card for the
    // people somebody happens to play with is a search that did not filter.
    expect(names()).toEqual(['Casey']);
    expect(summary()[0]).toContain('1');
    // And the footnote says whose rounds the figures above came from.
    expect(document.querySelector('.hint')?.textContent).toContain('the 1 round Casey played in');
  });

  it('keeps everybody when the search named a course, not a player', async () => {
    const user = userEvent.setup();
    show();

    await user.type(screen.getByLabelText('Search rounds'), 'pebble');
    expect(names()).toEqual(['Alex', 'Casey']);
    expect(document.querySelector('.hint')?.textContent).toContain('the rounds shown above');
  });

  it('counts the whole card at a course, and only rounds at it', async () => {
    const user = userEvent.setup();
    show();

    // Two Torrey rounds, and the Muirfield one left out of both the tiles and
    // the cards — Casey is on neither Torrey card.
    await user.type(screen.getByLabelText('Search rounds'), 'torrey');
    expect(names()).toEqual(['Alex']);
    expect(summary()[0]).toContain('1');

    await user.clear(screen.getByLabelText('Search rounds'));
    await user.type(screen.getByLabelText('Search rounds'), 'pebble beach');
    expect(names()).toEqual(['Alex', 'Casey']);
    expect(summary()[0]).toContain('1');
    expect(summary()[1]).toContain('18');
  });

  it('keeps the rounds and the cards agreeing when a course carries a name', async () => {
    const user = userEvent.setup();
    // "alex" is Alex, and it is also the first five letters of Alexandria.
    show([
      round({
        id: 'x',
        course: 'Alexandria Country Club',
        date: '2026-09-04',
        updatedAt: 9,
        players: [{ id: 'p3', name: 'Jordan' }],
      }),
      round({ id: 'y', course: 'Pebble Beach', date: '2026-05-01', updatedAt: 8 }),
    ]);

    await user.type(screen.getByLabelText('Search rounds'), 'alex');
    // The search found both rounds; only one of them is Alex's, and the tiles
    // have to say so or they are counting a round no card came from.
    expect(names()).toEqual(['Alex']);
    expect(summary()[0]).toContain('1');
    expect(summary()[1]).toContain('18');
    expect(screen.getByText('1 of 2 rounds')).toBeTruthy();
    expect(document.querySelector('.hint')?.textContent).toContain('the 1 round Alex played in');
  });

  it('puts both people up when the search named both', async () => {
    const user = userEvent.setup();
    show();

    await user.type(screen.getByLabelText('Search rounds'), 'alex casey');
    // Rounds with both, and a card each — not one person called "Alex Casey".
    expect(names()).toEqual(['Alex', 'Casey']);
    expect(summary()[0]).toContain('1');
  });

  it('gives back everybody when the search is cleared', async () => {
    const user = userEvent.setup();
    show();

    await user.type(screen.getByLabelText('Search rounds'), 'casey');
    await user.click(screen.getByLabelText('Clear search'));
    expect(names()).toEqual(['Alex', 'Casey']);
    expect(document.querySelector('.hint')?.textContent).toContain('on this device');
  });

  it('offers the years actually played in, newest first, and filters to one', async () => {
    const user = userEvent.setup();
    show();
    expect(years()).toEqual(['All', '2026', '2025']);

    await user.click(screen.getByRole('button', { name: '2025' }));
    expect(summary()[0]).toContain('1');
    expect(names()).toEqual(['Alex']);
    expect(screen.getByText('1 of 3 rounds')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'All' }));
    expect(summary()[0]).toContain('3');
    expect(document.querySelector('.history-count')).toBeNull();
    expect(document.querySelector('.hint')?.textContent).toContain('on this device');
  });

  it('combines the two, and names both when they leave nothing', async () => {
    const user = userEvent.setup();
    show();

    await user.click(screen.getByRole('button', { name: '2025' }));
    await user.type(screen.getByLabelText('Search rounds'), 'pebble');
    expect(screen.getByText('No rounds in 2025 match “pebble”.')).toBeTruthy();
    // The tools stay on screen — the filter that emptied it has to be reachable.
    expect(screen.getByLabelText('Search rounds')).toBeTruthy();
    expect(document.querySelector('.stat-summary')).toBeNull();
  });

  it('clears the search from its own button', async () => {
    const user = userEvent.setup();
    show();

    await user.type(screen.getByLabelText('Search rounds'), 'pebble');
    await user.click(screen.getByLabelText('Clear search'));
    expect(summary()[0]).toContain('3');
    expect(document.querySelector('.history-clear')).toBeNull();
  });

  it('leaves a round that was abandoned out of the pool it filters', () => {
    // `countsForStats` already excludes it from the arithmetic. The point here
    // is the denominator: "1 of 2 rounds" would be counting a round that put
    // no figure on screen.
    show([
      ROUNDS[0],
      round({ id: 'z', course: 'Bandon Dunes', date: '2026-06-01', status: 'in_progress', scores: {} }),
    ]);
    expect(summary()[0]).toContain('1');
    expect(document.querySelector('.history-count')).toBeNull();
    expect(document.querySelector('.history-tools')).toBeNull();
  });

  it('offers no tools at all with nothing to narrow', () => {
    show([ROUNDS[0]]);
    expect(document.querySelector('.history-tools')).toBeNull();
    expect(names()).toEqual(['Alex']);
  });

  it('offers no year row when every round is from one year', () => {
    show([ROUNDS[0], ROUNDS[1]]);
    expect(screen.getByLabelText('Search rounds')).toBeTruthy();
    expect(document.querySelector('.stat-years')).toBeNull();
  });

  it('keeps the empty screen for a device with no finished rounds', () => {
    show([round({ id: 'z', status: 'in_progress', scores: {} })]);
    expect(screen.getByText('No finished rounds yet')).toBeTruthy();
    expect(document.querySelector('.history-tools')).toBeNull();
  });
});
