// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';
import type { Round } from './types';
import { encodeRound } from './shareLink';

/**
 * A round arriving from somebody else's phone.
 *
 * The rules worth pinning here are the ones about the user's own data rather
 * than about the codec, which `shareLink.test.ts` covers: a round sent to you
 * is not written onto your device until you say so, the enormous payload does
 * not stay in the address bar, and a link that does not decode says so instead
 * of leaving a blank screen.
 */

const hs = Array.from({ length: 9 }, (_, i) => ({ number: i + 1, par: 4, strokeIndex: i + 1 }));

const sent: Round = {
  id: 'sent1234',
  course: 'Someone Else’s Club',
  date: '2026-09-11',
  createdAt: 1,
  updatedAt: 2,
  players: [
    { id: 'a1b2c3d4', name: 'Al' },
    { id: 'e5f6g7h8', name: 'Bo' },
  ],
  holes: hs,
  games: ['skins'],
  options: {
    useNet: false,
    stablefordMode: 'standard',
    loneWolfMultiplier: 2,
    blindWolfMultiplier: 3,
    stakes: { skins: 5 },
  },
  scores: { 1: { a1b2c3d4: 4, e5f6g7h8: 5 } },
  wolf: {},
  status: 'finished',
};

const stored = (): Round[] => JSON.parse(localStorage.getItem('press.rounds.v1') ?? '[]');

/** Opens the app with `hash` in the address bar, as following a link does. */
async function arriveWith(hash: string) {
  window.history.replaceState(null, '', `/${hash}`);
  render(<App />);
  await waitFor(() => expect(screen.queryByText('Opening round…')).toBeNull());
}

beforeEach(() => {
  localStorage.clear();
  window.history.replaceState(null, '', '/');
});
afterEach(cleanup);

describe('a round that arrives by link', () => {
  it('opens on the results, without writing anything to this device', async () => {
    await arriveWith(`#r=${await encodeRound(sent)}`);

    expect(screen.getByText('Someone Else’s Club')).toBeTruthy();
    expect(screen.getByText('Sent to you')).toBeTruthy();
    // The whole point: a round you were shown is not a round you played.
    expect(stored()).toEqual([]);
  });

  it('keeps it only when asked, and then says nothing more about it', async () => {
    await arriveWith(`#r=${await encodeRound(sent)}`);
    await userEvent.click(screen.getByRole('button', { name: 'Keep it' }));

    await waitFor(() => expect(stored()).toHaveLength(1));
    expect(stored()[0].id).toBe('sent1234');
    expect(stored()[0].players.map((p) => p.name)).toEqual(['Al', 'Bo']);
    expect(screen.queryByText('Sent to you')).toBeNull();
  });

  it('does not write it down just because a score was corrected on screen', async () => {
    // Editing an unkept round is reasonable — spotting a typo before deciding
    // whether to keep it is the normal case. Being given a round in your
    // history because you fixed somebody else's typo is not.
    await arriveWith(`#r=${await encodeRound(sent)}`);
    await userEvent.click(screen.getByRole('button', { name: /Edit handicaps/ }));
    const [first] = screen.getAllByPlaceholderText('HCP');
    await userEvent.type(first, '9');
    await userEvent.click(screen.getByRole('button', { name: 'Save handicaps' }));

    await waitFor(() => expect(screen.queryByText('Save handicaps')).toBeNull());
    expect(stored()).toEqual([]);
    // Still offered, because it still has not been kept.
    expect(screen.getByText('Sent to you')).toBeTruthy();

    // And once kept, the correction is what gets written.
    await userEvent.click(screen.getByRole('button', { name: 'Keep it' }));
    await waitFor(() => expect(stored()).toHaveLength(1));
    expect(stored()[0].players[0].handicap).toBe(9);
  });

  it('stops holding the next round back once a different one is opened', async () => {
    // `unkept` describes the round on screen. Left set, it would go on
    // suppressing the save for the next round the user actually played.
    // Seeded before the link is followed, so the whole thing happens inside
    // one App — a fresh render would reset the flag whatever `load` does.
    localStorage.setItem(
      'press.rounds.v1',
      JSON.stringify([{ ...sent, id: 'mine1234', course: 'My Club' }])
    );
    await arriveWith(`#r=${await encodeRound(sent)}`);
    await userEvent.click(screen.getByRole('button', { name: 'Home' }));
    await waitFor(() => expect(screen.queryByText('Sent to you')).toBeNull());

    await userEvent.click(screen.getByText('My Club'));
    await userEvent.click(screen.getByRole('button', { name: /Edit handicaps/ }));
    const [first] = screen.getAllByPlaceholderText('HCP');
    await userEvent.type(first, '7');
    await userEvent.click(screen.getByRole('button', { name: 'Save handicaps' }));

    await waitFor(() => {
      const mine = stored().find((r) => r.id === 'mine1234')!;
      expect(mine.players[0].handicap).toBe(7);
    });
  });

  it('takes the payload out of the address bar', async () => {
    // It is hundreds of characters long; a refresh would re-open it over
    // whatever the user had moved on to; and it would otherwise be carried
    // into the next link shared from this page.
    await arriveWith(`#r=${await encodeRound(sent)}`);
    expect(window.location.hash).toBe('');
  });

  it('says so when the link is damaged, rather than showing nothing', async () => {
    const whole = (await encodeRound(sent))!;
    await arriveWith(`#r=${whole.slice(0, 12)}`);

    expect(screen.getByRole('heading', { name: /Can’t open that link/ })).toBeTruthy();
    expect(screen.getByText(/damaged or incomplete/)).toBeTruthy();
    expect(stored()).toEqual([]);

    await userEvent.click(screen.getByRole('button', { name: 'Go to Press' }));
    expect(screen.getByRole('heading', { name: 'Press' })).toBeTruthy();
  });

  it('ignores a fragment that is not a shared round', async () => {
    await arriveWith('#play');
    expect(screen.getByRole('heading', { name: 'Press' })).toBeTruthy();
  });
});
