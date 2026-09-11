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

/** The round as it would be after `n` holes had been scored on this phone. */
function scoredTo(round: Round, n: number, ids = round.players.map((p) => p.id)): Round {
  const scores: Round['scores'] = {};
  for (let h = 1; h <= n; h += 1) {
    scores[h] = {};
    for (const id of ids) scores[h][id] = 4;
  }
  return { ...round, scores };
}

/** Puts a round on this device, the way having scored it would. */
const seed = (round: Round) =>
  localStorage.setItem('press.rounds.v1', JSON.stringify([round]));

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

describe('a round that is still being played', () => {
  const live: Round = { ...sent, status: 'in_progress' };

  it('offers to take it on, and goes to the card once taken', async () => {
    await arriveWith(`#r=${await encodeRound(scoredTo(live, 3))}`);

    expect(screen.getByText('Still being played. Take it on to keep scoring.')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Take it on' }));

    await waitFor(() => expect(stored()).toHaveLength(1));
    // Scoring, not filing: the next thing that happens is somebody hitting a
    // shot, so the card is where taking one on has to land.
    expect(screen.getByRole('button', { name: /Finish round|Next hole/ })).toBeTruthy();
  });

  it('scores onto the copy now on this device, not into the void', async () => {
    await arriveWith(`#r=${await encodeRound(scoredTo(live, 3))}`);
    await userEvent.click(screen.getByRole('button', { name: 'Take it on' }));
    await waitFor(() => expect(stored()).toHaveLength(1));

    // A score entered here has to reach storage, which is the whole point of
    // taking the round on rather than just looking at it.
    expect(stored()[0].scores[4]?.p0 ?? null).toBeNull();
    await userEvent.click(screen.getAllByRole('radio', { name: /^4, / })[0]);
    await waitFor(() => expect(stored()[0].scores[4].p0).toBe(4));
  });
});

describe('a round this device already has', () => {
  const live: Round = { ...sent, status: 'in_progress' };
  /**
   * The round as it looks once it has been through a link: players renumbered
   * `p0`, `p1` … and scored to `n` holes. That renumbering is the whole reason
   * the comparison works by position rather than by id.
   */
  const asDecoded = (round: Round, n: number): Round =>
    scoredTo(
      { ...round, players: round.players.map((p, i) => ({ ...p, id: `p${i}` })) },
      n,
      ['p0', 'p1']
    );

  it('says nothing has changed when the two copies match', async () => {
    seed(asDecoded(live, 9));
    await arriveWith(`#r=${await encodeRound(asDecoded(live, 9))}`);

    expect(screen.getByRole('heading', { name: /already have this round/ })).toBeTruthy();
    expect(screen.getByText(/already have this round, exactly as it is here/)).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Open it' }));
    expect(stored()).toHaveLength(1);
  });

  it('offers to bring a stale copy up to date, and says how much is missing', async () => {
    // The ordinary handover coming home: you scored nine and gave it away.
    seed(asDecoded(live, 4));
    await arriveWith(`#r=${await encodeRound(asDecoded(live, 9))}`);

    expect(screen.getByText('The copy you were sent has 10 scores yours doesn’t.')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Bring mine up to date' }));

    await waitFor(() => expect(stored()[0].scores[9]?.p0).toBe(4));
    expect(stored()).toHaveLength(1);
  });

  it('leaves a stale copy alone when asked to, writing nothing', async () => {
    seed(asDecoded(live, 4));
    const before = localStorage.getItem('press.rounds.v1');
    await arriveWith(`#r=${await encodeRound(asDecoded(live, 9))}`);
    await userEvent.click(screen.getByRole('button', { name: 'Leave mine as it is' }));

    expect(localStorage.getItem('press.rounds.v1')).toBe(before);
  });

  it('will not quietly pick a winner when both phones have scored', async () => {
    // The case this whole path exists for. Left to the backup merge, one of
    // these two sets of holes disappears on a timestamp, with nothing said.
    const mine = asDecoded(live, 6);
    const theirs = { ...asDecoded(live, 4), scores: { ...asDecoded(live, 4).scores, 7: { p0: 5, p1: 5 } } };
    seed(mine);
    await arriveWith(`#r=${await encodeRound(theirs)}`);

    expect(screen.getByRole('heading', { name: 'Two versions of this round' })).toBeTruthy();
    expect(screen.getByText(/Both phones have scored this round/)).toBeTruthy();
    // Keeping both is offered first, because it is the only answer that
    // loses nothing.
    expect(screen.getByRole('button', { name: 'Keep both' })).toBeTruthy();
    expect(stored()).toHaveLength(1);

    await userEvent.click(screen.getByRole('button', { name: 'Keep both' }));
    await waitFor(() => expect(stored()).toHaveLength(2));

    const ids = stored().map((r) => r.id);
    expect(new Set(ids).size).toBe(2);
    // Nothing was taken from either card.
    const kept = stored().find((r) => r.id === 'sent1234')!;
    const fork = stored().find((r) => r.id !== 'sent1234')!;
    expect(kept.scores[6].p0).toBe(4);
    expect(fork.scores[7].p0).toBe(5);
    expect(fork.course).toContain('(from a link)');
  });

  it('can be told to take theirs instead, which is the destructive answer', async () => {
    const mine = asDecoded(live, 6);
    const theirs = { ...asDecoded(live, 4), scores: { ...asDecoded(live, 4).scores, 7: { p0: 5, p1: 5 } } };
    seed(mine);
    await arriveWith(`#r=${await encodeRound(theirs)}`);
    await userEvent.click(screen.getByRole('button', { name: 'Use theirs, discard mine' }));

    await waitFor(() => expect(stored()).toHaveLength(1));
    expect(stored()[0].scores[7].p0).toBe(5);
    expect(stored()[0].scores[6]).toEqual({ p0: null, p1: null });
  });
});

describe('a link tapped while Press is already open', () => {
  it('opens the round instead of doing nothing', async () => {
    // Following a link with Press closed loads the page. Following one with
    // Press already open on the same origin changes only the fragment — a
    // same-document navigation, with no reload and no remount.
    render(<App />);
    expect(screen.getByRole('heading', { name: 'Press' })).toBeTruthy();

    window.location.hash = `#r=${await encodeRound(sent)}`;
    window.dispatchEvent(new HashChangeEvent('hashchange'));

    await waitFor(() => expect(screen.getByText('Someone Else’s Club')).toBeTruthy());
    expect(screen.getByText('Sent to you')).toBeTruthy();
    expect(window.location.hash).toBe('');
  });
});
