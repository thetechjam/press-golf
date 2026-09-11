// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Setup } from './Setup';
import type { SavedCourse } from '../types';

/**
 * The scorecard a round is about to be played on, and how much the screen
 * trusts it.
 *
 * Course search is open community data. A par out by one is invisible on the
 * Hole tab and silently wrong in every net score, Stableford point and Quota
 * target for the rest of the round, so the screen has to say where the numbers
 * came from and put them in front of the user rather than filling them in
 * behind a collapsed section.
 */

const COURSE = {
  id: 'c1',
  name: 'Bramble Ridge GC',
  holes_data: Array.from({ length: 18 }, (_, i) => ({
    number: i + 1,
    par: [4, 5, 3, 4, 4, 3, 5, 4, 4, 4, 3, 5, 4, 4, 3, 4, 5, 4][i],
    handicap_index: ((i * 7) % 18) + 1,
  })),
};

/** Answers the two OpenGolfAPI calls the search makes, and nothing else. */
function stubCourseApi() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const body = String(url).includes('/search')
        ? { courses: [{ id: 'c1', name: COURSE.name, city: 'Leeds', state: 'UK', par: 72 }] }
        : COURSE;
      return { ok: true, json: async () => body } as Response;
    })
  );
}

const openRow = async (user: ReturnType<typeof userEvent.setup>, label: string) => {
  const head = document
    .querySelectorAll<HTMLElement>('.setup-row-head')
    .values()
    .find((el) => el.textContent?.includes(label));
  if (head && head.getAttribute('aria-expanded') !== 'true') await user.click(head);
};

const rowOpen = (label: string) =>
  [...document.querySelectorAll<HTMLElement>('.setup-row-head')]
    .find((el) => el.textContent?.includes(label))
    ?.getAttribute('aria-expanded') === 'true';

const callOut = () => document.querySelector('.check-note');

/** Picks the first course search result, from typing to loaded scorecard. */
async function pickFromSearch(user: ReturnType<typeof userEvent.setup>) {
  await openRow(user, 'Course');
  const input = document.querySelector<HTMLInputElement>('.course-search input')!;
  await user.type(input, 'Bramble');
  const hit = await screen.findByText('Bramble Ridge GC', {}, { timeout: 3000 });
  await user.click(hit);
  await waitFor(() => expect(callOut()).not.toBeNull(), { timeout: 3000 });
}

beforeEach(() => {
  localStorage.clear();
  stubCourseApi();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('a scorecard loaded from course search', () => {
  it('opens the holes row rather than filling it in out of sight', async () => {
    const user = userEvent.setup();
    render(<Setup onCancel={() => {}} onStart={() => {}} />);

    // Start with it shut, which is how the screen opens.
    expect(rowOpen('Holes & pars')).toBe(false);
    await pickFromSearch(user);
    expect(rowOpen('Holes & pars')).toBe(true);
  });

  it('says to check the numbers, and why it matters', async () => {
    const user = userEvent.setup();
    render(<Setup onCancel={() => {}} onStart={() => {}} />);
    await pickFromSearch(user);

    expect(callOut()?.textContent).toMatch(/check these against the card/i);
    expect(callOut()?.textContent).toMatch(/sometimes wrong/i);
  });

  it('loads the pars it was given', async () => {
    const user = userEvent.setup();
    render(<Setup onCancel={() => {}} onStart={() => {}} />);
    await pickFromSearch(user);

    const hole2 = screen.getByLabelText('Par for hole 2') as HTMLSelectElement;
    expect(hole2.value).toBe('5');
  });

  it('stops warning once the user overwrites the pars themselves', async () => {
    const user = userEvent.setup();
    render(<Setup onCancel={() => {}} onStart={() => {}} />);
    await pickFromSearch(user);

    await user.click(screen.getByRole('button', { name: /All par 4/i }));
    // These are the user's own pars now; there is nothing left to check them
    // against.
    await waitFor(() => expect(callOut()).toBeNull());
  });
});

describe('a scorecard the user saved themselves', () => {
  const saved: SavedCourse = {
    id: 's1',
    name: 'Home Muni',
    holes: Array.from({ length: 9 }, (_, i) => ({ number: i + 1, par: 4, strokeIndex: i + 1 })),
  };

  it('is shown, but not second-guessed', async () => {
    localStorage.setItem('press.courses.v1', JSON.stringify([saved]));
    const user = userEvent.setup();
    render(<Setup onCancel={() => {}} onStart={() => {}} />);

    await openRow(user, 'Course');
    await user.click(await screen.findByText('Home Muni'));

    // Shown, because it rewrote every par on the card either way...
    await waitFor(() => expect(rowOpen('Holes & pars')).toBe(true));
    expect(screen.getByLabelText('Par for hole 1')).toBeTruthy();
    // ...but this is the user's own saved scorecard, not a database guess.
    expect(callOut()).toBeNull();
  });
});

describe('the par and stroke index fields', () => {
  it('each say which hole and which number they are', async () => {
    const user = userEvent.setup();
    render(<Setup onCancel={() => {}} onStart={() => {}} />);
    await openRow(user, 'Holes & pars');

    // Par alone needs no caption — there is only one box under the hole number.
    expect(screen.getByLabelText('Par for hole 7')).toBeTruthy();
    expect(document.querySelectorAll('.par-cap')).toHaveLength(0);

    await user.click(screen.getByRole('button', { name: /Set hole difficulty/i }));

    // With two boxes stacked, each gets a visible caption as well as a name —
    // and the default stroke indexes repeat the hole numbers, so an unlabelled
    // pair reads as the same value twice.
    await waitFor(() => expect(screen.getByLabelText('Stroke index for hole 7')).toBeTruthy());
    const cells = document.querySelectorAll('.par-cell');
    const first = within(cells[0] as HTMLElement);
    expect(first.getByText('Par')).toBeTruthy();
    expect(first.getByText('SI')).toBeTruthy();
  });

  it('puts each control in its own label, not two in one', async () => {
    const user = userEvent.setup();
    render(<Setup onCancel={() => {}} onStart={() => {}} />);
    // The cells have to be on screen, with both boxes showing, or this checks
    // labels that aren't there and passes for the wrong reason.
    await openRow(user, 'Holes & pars');
    await user.click(screen.getByRole('button', { name: /Set hole difficulty/i }));
    await waitFor(() => expect(screen.getByLabelText('Stroke index for hole 1')).toBeTruthy());
    expect(document.querySelectorAll('.par-cell').length).toBeGreaterThan(0);

    // A <label> may name a single control; a cell holding a par select and a
    // stroke index input inside one label leaves both ambiguously named.
    for (const label of document.querySelectorAll('label')) {
      expect(label.querySelectorAll('input, select, textarea').length).toBeLessThan(2);
    }
  });
});
