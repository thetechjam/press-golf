// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Round } from '../types';
import { History } from './History';

/**
 * Finding one round among many, and clearing some out.
 *
 * The searching and grouping are tested without a DOM in `history.test.ts`.
 * What is here is the part that only exists on screen: that nothing is deleted
 * without being asked for twice, that select mode and per-card delete do not
 * both arm at once, and that an empty list says which filter emptied it.
 */

const round = (over: Partial<Round>): Round => ({
  id: 'r',
  course: 'Torrey Pines South',
  date: '2026-09-11',
  createdAt: 1,
  updatedAt: 1,
  players: [{ id: 'p1', name: 'Alex' }],
  holes: Array.from({ length: 18 }, (_, i) => ({ number: i + 1, par: 4, strokeIndex: i + 1 })),
  games: ['skins'],
  options: {
    useNet: false,
    stablefordMode: 'standard',
    loneWolfMultiplier: 2,
    blindWolfMultiplier: 3,
    stakes: {},
  },
  scores: {},
  wolf: {},
  status: 'finished',
  ...over,
});

const ROUNDS: Round[] = [
  round({ id: 'a', course: 'Torrey Pines South', date: '2026-09-11', updatedAt: 5 }),
  round({
    id: 'b',
    course: 'Pebble Beach',
    date: '2026-09-02',
    updatedAt: 4,
    status: 'in_progress',
    players: [{ id: 'p1', name: 'Casey' }],
  }),
  round({ id: 'c', course: 'Muirfield', date: '2026-08-20', updatedAt: 3 }),
];

const stored = (): Round[] => JSON.parse(localStorage.getItem('press.rounds.v1') ?? '[]');
const titles = () => [...document.querySelectorAll('.round-title')].map((t) => t.textContent);

const show = (rounds: Round[] = ROUNDS) => {
  localStorage.setItem('press.rounds.v1', JSON.stringify(rounds));
  return render(<History onBack={() => {}} onResume={() => {}} onViewResults={() => {}} />);
};

beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe('finding a round', () => {
  it('lists them under the month they were played', () => {
    show();
    expect([...document.querySelectorAll('.history-group h2')].map((h) => h.textContent)).toEqual([
      'September',
      'August',
    ]);
    expect(titles()).toEqual(['Torrey Pines South', 'Pebble Beach', 'Muirfield']);
  });

  it('narrows as you type, and says how much of the list is left', async () => {
    const user = userEvent.setup();
    show();
    expect(screen.getByText('3 rounds')).toBeTruthy();

    await user.type(screen.getByLabelText('Search rounds'), 'casey');
    expect(titles()).toEqual(['Pebble Beach']);
    // The count is the answer to "did the filter work"; the list only answers
    // it by being counted.
    expect(screen.getByText('1 of 3 rounds')).toBeTruthy();
  });

  it('separates what you can still play from what is done', async () => {
    const user = userEvent.setup();
    show();
    await user.click(screen.getByRole('button', { name: 'Unfinished' }));
    expect(titles()).toEqual(['Pebble Beach']);
    await user.click(screen.getByRole('button', { name: 'Finished' }));
    expect(titles()).toEqual(['Torrey Pines South', 'Muirfield']);
  });

  it('names the filter that emptied the list, not just the emptiness', async () => {
    // "No rounds" in front of somebody who has played forty is a bug report
    // waiting to happen.
    const user = userEvent.setup();
    show();
    await user.type(screen.getByLabelText('Search rounds'), 'zzz');
    expect(screen.getByText('No rounds match “zzz”.')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Unfinished' }));
    expect(screen.getByText('No unfinished rounds match “zzz”.')).toBeTruthy();
  });

  it('puts the whole list back when the search is cleared', async () => {
    const user = userEvent.setup();
    show();
    await user.type(screen.getByLabelText('Search rounds'), 'pebble');
    await user.click(screen.getByLabelText('Clear search'));
    expect(titles()).toHaveLength(3);
  });
});

describe('clearing rounds out', () => {
  it('deletes nothing until the number has been read twice', async () => {
    const user = userEvent.setup();
    show();
    await user.click(screen.getByRole('button', { name: 'Select' }));
    await user.click(screen.getAllByRole('button', { name: /Torrey Pines South/ })[0]);
    await user.click(screen.getAllByRole('button', { name: /Muirfield/ })[0]);

    // First tap arms, and names what is about to go.
    await user.click(screen.getByRole('button', { name: 'Delete 2' }));
    expect(stored()).toHaveLength(3);
    expect(screen.getByRole('button', { name: 'Delete 2 for good' })).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Delete 2 for good' }));
    await waitFor(() => expect(stored()).toHaveLength(1));
    expect(stored()[0].id).toBe('b');
  });

  it('can be backed out of after arming', async () => {
    const user = userEvent.setup();
    show();
    await user.click(screen.getByRole('button', { name: 'Select' }));
    await user.click(screen.getAllByRole('button', { name: /Pebble Beach/ })[0]);
    await user.click(screen.getByRole('button', { name: 'Delete 1' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(stored()).toHaveLength(3);
    expect(screen.getByRole('button', { name: 'Delete 1' })).toBeTruthy();
  });

  it('will not delete nothing', async () => {
    const user = userEvent.setup();
    show();
    await user.click(screen.getByRole('button', { name: 'Select' }));
    expect((screen.getByRole('button', { name: 'Delete' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('selects only what the filter is showing', async () => {
    // "Select all" under a search that shows two of forty must not arm the
    // other thirty-eight.
    const user = userEvent.setup();
    show();
    await user.type(screen.getByLabelText('Search rounds'), 'torrey');
    await user.click(screen.getByRole('button', { name: 'Select' }));
    await user.click(screen.getByRole('button', { name: 'Select all' }));
    expect(screen.getByRole('button', { name: 'Delete 1' })).toBeTruthy();
  });

  it('stands the per-card delete down while selecting', async () => {
    // Arming one row's delete with others ticked is two destructive gestures
    // competing for the same tap.
    const user = userEvent.setup();
    show();
    expect(screen.getAllByRole('button', { name: /^Delete round/ }).length).toBe(3);
    await user.click(screen.getByRole('button', { name: 'Select' }));
    expect(screen.queryAllByRole('button', { name: /^Delete round/ })).toEqual([]);
  });

  it('forgets the selection on the way out', async () => {
    const user = userEvent.setup();
    show();
    await user.click(screen.getByRole('button', { name: 'Select' }));
    await user.click(screen.getAllByRole('button', { name: /Pebble Beach/ })[0]);
    await user.click(screen.getByRole('button', { name: 'Done' }));
    await user.click(screen.getByRole('button', { name: 'Select' }));

    expect((screen.getByRole('button', { name: 'Delete' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('still deletes one at a time when not selecting', async () => {
    const user = userEvent.setup();
    show();
    const card = screen.getAllByRole('button', { name: /^Delete round/ })[0];
    await user.click(card);
    await user.click(screen.getByRole('button', { name: /Tap again to delete/ }));
    await waitFor(() => expect(stored()).toHaveLength(2));
  });
});

describe('an empty device', () => {
  it('says so without offering tools for a list that is not there', () => {
    show([]);
    expect(screen.getByText('No rounds yet.')).toBeTruthy();
    expect(screen.queryByLabelText('Search rounds')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Select' })).toBeNull();
  });
});

describe('opening one', () => {
  it('resumes a round still being played and reviews a finished one', async () => {
    const user = userEvent.setup();
    const opened: string[] = [];
    localStorage.setItem('press.rounds.v1', JSON.stringify(ROUNDS));
    render(
      <History
        onBack={() => {}}
        onResume={(r) => opened.push(`resume:${r.id}`)}
        onViewResults={(r) => opened.push(`results:${r.id}`)}
      />
    );
    await user.click(screen.getAllByRole('button', { name: /Pebble Beach/ })[0]);
    await user.click(screen.getAllByRole('button', { name: /Muirfield/ })[0]);
    expect(opened).toEqual(['resume:b', 'results:c']);
  });
});
