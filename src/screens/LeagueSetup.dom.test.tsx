// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LeagueSetup } from './LeagueSetup';
import type { Round, SavedCourse } from '../types';

/**
 * A league night off a Handicap Index.
 *
 * League scoring was the one format the handicap work never reached: it read
 * `player.handicap` straight off the player and the screen only ever asked for
 * a stroke count. The engine side is in `games/league.test.ts`; what is here
 * is the screen — including the defect that made the first version of this
 * unshippable, where the rated path collected an Index and the validation
 * still demanded a handicap, so the round could not be started at all.
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

const indexFields = () => screen.getAllByPlaceholderText('Index');
const nameFields = () => document.querySelectorAll<HTMLInputElement>('.player-name');

async function fillFour(user: ReturnType<typeof userEvent.setup>, values: number[]) {
  const names = ['Al', 'Bo', 'Cy', 'Di'];
  for (const [i, field] of [...nameFields()].entries()) await user.type(field, names[i]);
  for (const [i, field] of indexFields().entries()) await user.type(field, String(values[i]));
}

beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe('asking for an Index', () => {
  it('asks for a stroke count until the course can convert one', () => {
    show([{ id: 'c2', name: 'Unrated Muni', holes }]);
    expect(screen.getAllByPlaceholderText('HCP')).toHaveLength(4);
    expect(screen.queryByPlaceholderText('Index')).toBeNull();
  });

  it('asks for an Index once the nine is rated', async () => {
    const user = userEvent.setup();
    show();
    await loadCourse(user);
    expect(indexFields()).toHaveLength(4);
    expect(screen.queryByPlaceholderText('HCP')).toBeNull();
  });

  it('says the rating covers eighteen holes while nine are being played', async () => {
    // The case that makes `ratingHoles` worth storing: without it this rating
    // is judged against nine holes, fails as implausible, and the Index column
    // never appears for a league night at all.
    const user = userEvent.setup();
    show();
    await loadCourse(user);
    expect(
      screen.getByText('Rated over 18 holes — an Index converts to strokes for this nine.')
    ).toBeTruthy();
  });

  it('shows what an Index is worth over this nine', async () => {
    const user = userEvent.setup();
    show();
    await loadCourse(user);
    // Slope 113 and a rating of 72 over eighteen is par over these nine, so an
    // Index is worth half of itself here.
    await user.type(indexFields()[0], '14');
    expect(screen.getByLabelText('Plays off 7 on this nine')).toBeTruthy();
    await user.type(indexFields()[1], '6');
    expect(screen.getByLabelText('Plays off 3 on this nine')).toBeTruthy();
  });
});

describe('starting the night', () => {
  it('starts off Indexes, which the first version of this could not', async () => {
    // The rated path collected an Index while the guard still demanded a
    // handicap, so the button did nothing, every time, with no message.
    const user = userEvent.setup();
    const started = show();
    await loadCourse(user);
    await fillFour(user, [14, 6, 16, 4]);
    await user.click(screen.getByRole('button', { name: /Start League Round/ }));

    await waitFor(() => expect(started).toHaveLength(1));
    const round = started[0];
    expect(round.players.map((p) => p.index)).toEqual([14, 6, 16, 4]);
    // Carried so the engine can convert, and so a rating later found wrong
    // does not leave the round unscoreable.
    expect(round.slope).toBe(113);
    expect(round.rating).toBe(72);
    expect(round.ratingHoles).toBe(18);
    expect(round.holes).toHaveLength(9);
  });

  it('names the field actually on screen when one is blank', async () => {
    // Asking for "a handicap" under four boxes labelled Index is the same
    // defect as the par/stroke-index fields.
    const user = userEvent.setup();
    const started = show();
    await loadCourse(user);
    await fillFour(user, [14, 6, 16, 4]);
    await user.clear(indexFields()[0]);
    await user.click(screen.getByRole('button', { name: /Start League Round/ }));

    expect(
      screen.getByText('Enter a Handicap Index for all four players — league scoring needs it.')
    ).toBeTruthy();
    expect(started).toHaveLength(0);
  });

  it('still asks for a handicap when there is no rating to convert against', async () => {
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
