// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';
import type { SavedCourse } from './types';
import { encodeCourse } from './shareCourse';

/**
 * A course arriving from somebody else's phone.
 *
 * The point of sending one is that search data is sometimes wrong and somebody
 * has to read it. So the rules here are about looking before saving: the card
 * is on screen, anything odd about it is named, and nothing is written until
 * it is asked for.
 */

const torrey: SavedCourse = {
  id: 'local001',
  name: 'Torrey Pines South',
  holes: [4, 4, 3, 5, 4, 4, 3, 4, 5, 4, 4, 3, 5, 4, 4, 3, 4, 5].map((par, i) => ({
    number: i + 1,
    par,
    strokeIndex: [7, 3, 15, 1, 9, 17, 5, 11, 13, 8, 18, 2, 4, 10, 16, 6, 12, 14][i],
  })),
  slope: 129,
  rating: 74.6,
};

const saved = (): SavedCourse[] => JSON.parse(localStorage.getItem('press.courses.v1') ?? '[]');
const seed = (courses: SavedCourse[]) =>
  localStorage.setItem('press.courses.v1', JSON.stringify(courses));

async function arriveWith(course: SavedCourse) {
  window.history.replaceState(null, '', `/#c=${await encodeCourse(course)}`);
  render(<App />);
  await waitFor(() => expect(screen.queryByText('Opening round…')).toBeNull());
}

beforeEach(() => {
  localStorage.clear();
  window.history.replaceState(null, '', '/');
});
afterEach(cleanup);

describe('a course that arrives by link', () => {
  it('shows the card before it shows a save button', async () => {
    await arriveWith(torrey);

    expect(screen.getByRole('heading', { name: 'A course was sent to you' })).toBeTruthy();
    expect(screen.getByText('Torrey Pines South')).toBeTruthy();
    expect(document.querySelector('.arriving-sub')?.textContent).toBe(
      '18 holes · par 72 · stroke index set · 129/74.6'
    );
    // Every hole's par and rank, because "trust me" is what got the bad data
    // in — laid out in nines, the way a scorecard is printed, so the back nine
    // is not off the side of a phone where nobody would read it.
    const rows = screen
      .getAllByRole('row')
      .map((r) => [...r.children].map((cell) => cell.textContent!));
    expect(rows).toEqual([
      ['Hole', '1', '2', '3', '4', '5', '6', '7', '8', '9'],
      ['Par', '4', '4', '3', '5', '4', '4', '3', '4', '5'],
      ['SI', '7', '3', '15', '1', '9', '17', '5', '11', '13'],
      ['Hole', '10', '11', '12', '13', '14', '15', '16', '17', '18'],
      ['Par', '4', '4', '3', '5', '4', '4', '3', '4', '5'],
      ['SI', '8', '18', '2', '4', '10', '16', '6', '12', '14'],
    ]);
  });

  it('writes nothing until it is asked to', async () => {
    await arriveWith(torrey);
    expect(saved()).toEqual([]);

    await userEvent.click(screen.getByRole('button', { name: 'Save this course' }));
    await waitFor(() => expect(saved()).toHaveLength(1));
    expect(saved()[0].name).toBe('Torrey Pines South');
    expect(saved()[0].slope).toBe(129);
  });

  it('can be turned down, leaving nothing behind', async () => {
    await arriveWith(torrey);
    await userEvent.click(screen.getByRole('button', { name: 'No thanks' }));

    expect(saved()).toEqual([]);
    expect(screen.getByRole('heading', { name: 'Press' })).toBeTruthy();
  });

  it('says what looks wrong with the card, on the way in', async () => {
    // The same reading that flags a search result. A card with two holes ranked
    // the same hands out the wrong number of strokes, and without this it says
    // so on the sixteenth tee when the settlement comes out odd.
    const broken: SavedCourse = {
      ...torrey,
      holes: torrey.holes.map((h) => (h.number === 2 ? { ...h, strokeIndex: 7 } : h)),
    };
    await arriveWith(broken);

    expect(screen.getByText('Worth checking against the card')).toBeTruthy();
    expect(screen.getByText(/used more than once/)).toBeTruthy();
    // Still savable: plenty of odd scorecards are simply unusual, and the
    // person holding the real one decides.
    expect(screen.getByRole('button', { name: 'Save this course' })).toBeTruthy();
  });
});

describe('a course you already have', () => {
  it('says so and asks for nothing when the two cards agree', async () => {
    seed([torrey]);
    await arriveWith({ ...torrey, id: 'theirs' });

    expect(screen.getByRole('heading', { name: 'You already have this course' })).toBeTruthy();
    expect(screen.getByText(/already matches it, hole for hole/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Replace/ })).toBeNull();
    expect(saved()).toHaveLength(1);
  });

  it('names what differs rather than counting it', async () => {
    seed([{ ...torrey, holes: torrey.holes.map((h) => (h.number === 4 ? { ...h, par: 4 } : h)) }]);
    await arriveWith(torrey);

    expect(screen.getByText('This differs from the one you have')).toBeTruthy();
    expect(screen.getByText('Par differs on hole 4.')).toBeTruthy();
  });

  it('keeps both under names you can tell apart', async () => {
    seed([{ ...torrey, holes: torrey.holes.map((h) => (h.number === 4 ? { ...h, par: 4 } : h)) }]);
    await arriveWith(torrey);
    await userEvent.click(screen.getByRole('button', { name: 'Keep both' }));

    await waitFor(() => expect(saved()).toHaveLength(2));
    expect(saved().map((c) => c.name).sort()).toEqual([
      'Torrey Pines South',
      'Torrey Pines South (sent)',
    ]);
    // The one you had is untouched.
    expect(saved().find((c) => c.name === 'Torrey Pines South')!.holes[3].par).toBe(4);
  });

  it('replaces in place, keeping the record you already had', async () => {
    seed([{ ...torrey, holes: torrey.holes.map((h) => (h.number === 4 ? { ...h, par: 4 } : h)) }]);
    await arriveWith(torrey);
    await userEvent.click(screen.getByRole('button', { name: 'Replace mine with theirs' }));

    await waitFor(() => expect(saved()[0].holes[3].par).toBe(5));
    // One record, not two: replacing reuses the local id, so a round that
    // named this course still names the same one.
    expect(saved()).toHaveLength(1);
    expect(saved()[0].id).toBe('local001');
  });
});
