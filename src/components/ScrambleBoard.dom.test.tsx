// @vitest-environment happy-dom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import type { Round } from '../types';
import { ScrambleBoard } from './ScrambleBoard';
import { driveStatus, type DriveState } from '../games/scramble';
import { scrambleRound } from '../games/testFixtures';

/**
 * The Tee shots card. The sentences come from `driveStatus`, which has its own
 * tests; what is pinned here is that each state reaches the card, and that the
 * two that mean "you are out of room" look like a warning rather than a
 * footnote.
 */

const members = ['Jesse', 'Sam', 'Al'];
const all = (n: number, s: number) =>
  Object.fromEntries(Array.from({ length: n }, (_, i) => [i + 1, { t1: s }]));

const cases: [DriveState, Round][] = [
  ['none', scrambleRound({ teams: [{ members }], shots: { 1: { t1: [0] } } })],
  [
    'met',
    scrambleRound({
      teams: [{ members }],
      minDrives: 1,
      scores: all(3, 4),
      shots: { 1: { t1: [0] }, 2: { t1: [1] }, 3: { t1: [2] } },
    }),
  ],
  ['owed', scrambleRound({ teams: [{ members }], minDrives: 2 })],
  // Three people owed six each, with eighteen holes open: every drive is spoken for.
  ['tight', scrambleRound({ teams: [{ members }], minDrives: 6 })],
  // Jesse took seven drives when six would do: twelve owed and eleven holes left.
  [
    'short',
    scrambleRound({
      teams: [{ members }],
      minDrives: 6,
      scores: all(7, 4),
      shots: Object.fromEntries(Array.from({ length: 7 }, (_, i) => [i + 1, { t1: [0] }])),
    }),
  ],
];

afterEach(cleanup);

describe('the tee shots card', () => {
  it.each(cases)('renders the %s note', (state, round) => {
    const status = driveStatus(round, 't1');
    expect(status.state).toBe(state);
    render(<ScrambleBoard round={round} />);
    const card = screen.getByRole('region', { name: 'Tee shots' });
    if (state === 'none') {
      expect(card.querySelector('.scr-note')).toBeNull();
      expect(card.querySelector('.scr-pips')).toBeNull();
      return;
    }
    const note = within(card).getByText(status.note);
    expect(note.classList.contains('warn')).toBe(state === 'tight' || state === 'short');
  });

  it('counts each member’s drives against the minimum, and colours the ones that are met', () => {
    render(<ScrambleBoard round={cases[1][1]} />);
    const counts = screen.getAllByLabelText(/of 1 tee shots/);
    expect(counts.map((c) => c.textContent)).toEqual(['1', '1', '1']);
    expect(counts.every((c) => c.classList.contains('met'))).toBe(true);
    expect(screen.getAllByText('1 shot played')).toHaveLength(3);
  });

  it('says how many shots each played and holed, quietly', () => {
    const round = scrambleRound({
      teams: [{ members }],
      scores: { 1: { t1: 3 } },
      shots: { 1: { t1: [0, 0, 1] } },
    });
    render(<ScrambleBoard round={round} />);
    expect(screen.getByText('2 shots played')).toBeTruthy();
    expect(screen.getByText('1 shot played · 1 holed out')).toBeTruthy();
  });

  it('names the team only when there is more than one', () => {
    const two = scrambleRound({
      teams: [
        { name: 'Hackers', members: ['Jesse', 'Sam'] },
        { name: 'Fore Play', members: ['Al', 'Bo'] },
      ],
    });
    render(<ScrambleBoard round={two} />);
    expect(screen.getByRole('region', { name: 'Tee shots, Hackers' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Tee shots, Fore Play' })).toBeTruthy();
    cleanup();

    render(<ScrambleBoard round={cases[0][1]} />);
    expect(screen.getByRole('region', { name: 'Tee shots' }).textContent).not.toContain('Team 1');
  });
});
