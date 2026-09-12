// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Round } from '../types';
import { Results } from './Results';

/**
 * The foot of the Results screen.
 *
 * It had grown to five controls, three of them identical ghost rows: two
 * picture buttons, a text fallback, the round's own link, and an edit that was
 * not sharing at all. What is pinned here is the shape that replaced it — one
 * way out of the screen, the rest grouped in a sheet — and the one behaviour
 * that had to survive losing its button: sharing as text.
 */

vi.mock('../shareCard', () => ({ renderShareCard: vi.fn() }));
vi.mock('../scorecardCard', () => ({ renderScorecardCard: vi.fn() }));
import { renderShareCard } from '../shareCard';

const hs = Array.from({ length: 9 }, (_, i) => ({ number: i + 1, par: 4, strokeIndex: i + 1 }));

const round = (over: Partial<Round> = {}): Round => ({
  id: 'r1',
  course: 'Half Moon Bay',
  date: '2026-09-12',
  createdAt: 1,
  updatedAt: 2,
  players: [
    { id: 'p1', name: 'Al', handicap: 6 },
    { id: 'p2', name: 'Bo', handicap: 12 },
  ],
  holes: hs,
  games: ['skins'],
  options: {
    useNet: true,
    stablefordMode: 'standard',
    loneWolfMultiplier: 2,
    blindWolfMultiplier: 3,
    stakes: { skins: 5 },
  },
  scores: Object.fromEntries(hs.map((h) => [h.number, { p1: 4, p2: 5 }])),
  wolf: {},
  status: 'finished',
  ...over,
});

const show = (over: Partial<Round> = {}) =>
  render(
    <Results round={round(over)} onChange={() => {}} onHome={() => {}} onBackToPlay={() => {}} />
  );

let written: string[] = [];

beforeEach(() => {
  written = [];
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: (t: string) => { written.push(t); return Promise.resolve(); } },
  });
});
afterEach(cleanup);

describe('the foot of the screen', () => {
  it('offers one way to share, not five', () => {
    show();
    // The guard against this accreting again: anything new belongs in the
    // sheet, not in another row under the boards.
    const foot = screen.getByRole('button', { name: 'Share' });
    expect(foot).toBeTruthy();
    for (const gone of ['Share as text instead', 'Send the round to a phone', 'Share results']) {
      expect(screen.queryByRole('button', { name: gone })).toBeNull();
    }
  });

  it('puts both pictures and the round’s own link in the sheet', async () => {
    show();
    await userEvent.click(screen.getByRole('button', { name: 'Share' }));

    const sheet = await screen.findByRole('dialog');
    expect(within(sheet).getByRole('button', { name: 'Share results' })).toBeTruthy();
    expect(within(sheet).getByRole('button', { name: 'Share scorecard' })).toBeTruthy();
    // What each one actually produces, which "Results" and "Scorecard" side by
    // side never said.
    expect(within(sheet).getByText('The scoreboard, as an image')).toBeTruthy();
    expect(within(sheet).getByText('Every hole, as an image')).toBeTruthy();
    // And, below the rule, the round itself.
    expect(within(sheet).getByText(/or send the round itself/i)).toBeTruthy();
    await waitFor(() =>
      expect(within(sheet).getByRole('button', { name: 'Send the link' })).toBeTruthy()
    );
  });

  it('still falls back to text when a picture cannot be built', async () => {
    // The button for this was dropped because the fallback already fires on
    // its own. That is only true while it actually does.
    vi.mocked(renderShareCard).mockRejectedValueOnce(new Error('no canvas'));
    show();
    await userEvent.click(screen.getByRole('button', { name: 'Share' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Share results' }));

    await waitFor(() => expect(written).toHaveLength(1));
    expect(written[0]).toContain('Half Moon Bay');
    expect(written[0]).toContain('via Press');
  });
});

describe('editing the numbers that decide the money', () => {
  it('sits with Edit stakes, where the money is', async () => {
    show();
    const settlement = document.querySelector('.settlement')!;
    const head = settlement.querySelector('.board-head')! as HTMLElement;
    expect(within(head).getByRole('button', { name: 'Edit handicaps' })).toBeTruthy();
    expect(within(head).getByRole('button', { name: 'Edit stakes' })).toBeTruthy();

    await userEvent.click(within(head).getByRole('button', { name: 'Edit handicaps' }));
    expect(await screen.findByRole('button', { name: 'Save handicaps' })).toBeTruthy();
  });

  it('is offered even when nobody has a handicap yet', async () => {
    // Which is exactly when you would want it: the way to put one in.
    show({ players: [{ id: 'p1', name: 'Al' }, { id: 'p2', name: 'Bo' }] });
    await userEvent.click(screen.getByRole('button', { name: 'Edit handicaps' }));
    expect(await screen.findByRole('button', { name: 'Save handicaps' })).toBeTruthy();
  });

  it('moves to the league board on a league night, which has no settlement', async () => {
    show({
      games: [],
      options: {
        ...round().options,
        stakes: {},
        league: {
          pointsPerMatch: 3,
          teams: [
            { name: 'The Hackers', aId: 'p1', bId: 'p2' },
            { name: 'Fore Play', aId: 'p1', bId: 'p2' },
          ],
        },
      },
    });
    expect(document.querySelector('.settlement')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Edit handicaps' }));
    expect(await screen.findByRole('button', { name: 'Save handicaps' })).toBeTruthy();
  });
});
