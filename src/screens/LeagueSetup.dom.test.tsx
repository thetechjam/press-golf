// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LeagueSetup } from './LeagueSetup';
import type { Round, SavedCourse } from '../types';

/**
 * League handicaps on the League Setup screen.
 *
 * League handicaps are the league's own stroke counts — 90% of a player's
 * recent average over par, kept by the league director — not a Handicap Index
 * to be converted against the course. The screen used to offer the Index route
 * once a slope and rating were known, which turned every league handicap into
 * the wrong number; it now asks for a stroke count, always.
 */

const holes = [4, 4, 3, 5, 4, 4, 3, 4, 5, 4, 4, 3, 5, 4, 4, 3, 4, 5].map((par, i) => ({
  number: i + 1,
  par,
  strokeIndex: [7, 3, 15, 1, 9, 17, 5, 11, 13, 8, 18, 2, 4, 10, 16, 6, 12, 14][i],
}));

/** An eighteen-hole course with eighteen-hole figures — what league nights use. */
const course: SavedCourse = {
  id: 'c1',
  name: 'Thursday Night Muni',
  holes,
  slope: 113,
  rating: 72,
};

const show = (saved: SavedCourse[] = [course]) => {
  localStorage.setItem('press.courses.v1', JSON.stringify(saved));
  const started: Round[] = [];
  render(<LeagueSetup onCancel={() => {}} onStart={(r) => started.push(r)} />);
  return started;
};

const loadCourse = (user: ReturnType<typeof userEvent.setup>) =>
  user.click(document.querySelector('.saved-course-load')!);

const hcpFields = () => screen.getAllByPlaceholderText('HCP');
const nameFields = () => document.querySelectorAll<HTMLInputElement>('.player-name');

async function fillFour(user: ReturnType<typeof userEvent.setup>, values: number[]) {
  const names = ['Al', 'Bo', 'Cy', 'Di'];
  for (const [i, field] of [...nameFields()].entries()) await user.type(field, names[i]);
  for (const [i, field] of hcpFields().entries()) await user.type(field, String(values[i]));
}

beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe('league handicaps', () => {
  it('asks for a stroke count, not an Index, even on a rated course', async () => {
    const user = userEvent.setup();
    show();
    await loadCourse(user);
    expect(hcpFields()).toHaveLength(4);
    expect(screen.queryByPlaceholderText('Index')).toBeNull();
    expect(screen.queryByText('Slope')).toBeNull();
  });

  it('starts off the stroke counts and carries no rating to convert them', async () => {
    const user = userEvent.setup();
    const started = show();
    await loadCourse(user);
    await fillFour(user, [4, 9, 6, 12]);
    await user.click(screen.getByRole('button', { name: /Start League Round/ }));

    expect(started).toHaveLength(1);
    const [round] = started;
    expect(round.players.map((p) => p.handicap)).toEqual([4, 9, 6, 12]);
    expect(round.slope).toBeUndefined();
    expect(round.rating).toBeUndefined();
  });

  it('puts the lower handicap of each team in the A match, and says so first', async () => {
    const user = userEvent.setup();
    const started = show();
    // Team 1 typed the wrong way round: Bo (3) in B, Al (9) in A.
    await fillFour(user, [9, 3, 6, 12]);
    expect(screen.getByText(/Bo has the lower handicap, so plays A/)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: /Start League Round/ }));

    const [round] = started;
    const name = (id: string) => round.players.find((p) => p.id === id)!.name;
    const [t1, t2] = round.options.league!.teams;
    expect([name(t1.aId), name(t1.bId)]).toEqual(['Bo', 'Al']);
    expect([name(t2.aId), name(t2.bId)]).toEqual(['Cy', 'Di']);
    // And the card lists them in their new slots.
    expect(round.players.map((p) => p.name)).toEqual(['Bo', 'Al', 'Cy', 'Di']);
  });

  it('asks for a handicap when one is blank', async () => {
    const user = userEvent.setup();
    const started = show([{ id: 'c2', name: 'Unrated Muni', holes }]);
    await loadCourse(user);
    for (const [i, field] of [...nameFields()].entries())
      await user.type(field, ['Al', 'Bo', 'Cy', 'Di'][i]);
    await user.click(screen.getByRole('button', { name: /Start League Round/ }));

    expect(
      screen.getByText('Enter a handicap for all four players — league scoring needs it.')
    ).toBeTruthy();
    expect(started).toHaveLength(0);
  });
});

/** The same pinned bar as Setup, for the same reason — see `Setup.dom.test.tsx`. */
describe('the pinned Start bar', () => {
  it('keeps the button and any refusal in it, announced', async () => {
    const user = userEvent.setup();
    const started = show();
    const cta = screen.getByRole('button', { name: /Start League Round/ });
    expect(cta.closest('.screen-foot')).not.toBeNull();

    await user.click(cta);
    expect(started).toHaveLength(0);
    const error = document.querySelector('.screen-foot .error')!;
    expect(error).not.toBeNull();
    expect(error.getAttribute('role')).toBe('alert');
  });
});
