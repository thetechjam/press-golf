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
function stubCourseApi(course: unknown = COURSE) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const body = String(url).includes('/search')
        ? { courses: [{ id: 'c1', name: COURSE.name, city: 'Leeds', state: 'UK', par: 72 }] }
        : course;
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

describe('a scorecard that arrives damaged', () => {
  it('names what looks wrong instead of importing it quietly', async () => {
    // Hole 3 comes back as a par 12, and stroke index 1 is used twice.
    stubCourseApi({
      id: 'c1',
      name: COURSE.name,
      holes_data: COURSE.holes_data.map((h, i) => ({
        ...h,
        par: i === 2 ? 12 : h.par,
        handicap_index: i === 5 ? 1 : h.handicap_index,
      })),
    });
    const user = userEvent.setup();
    render(<Setup onCancel={() => {}} onStart={() => {}} />);
    await pickFromSearch(user);

    const text = callOut()!.textContent!;
    expect(text).toMatch(/looks off/i);
    expect(text).toMatch(/Hole 3 came back as par 12/);
    expect(text).toMatch(/used more than once/);
  });

  it('lets the impossible par be seen and corrected', async () => {
    stubCourseApi({
      id: 'c1',
      name: COURSE.name,
      holes_data: COURSE.holes_data.map((h, i) => ({ ...h, par: i === 2 ? 12 : h.par })),
    });
    const user = userEvent.setup();
    render(<Setup onCancel={() => {}} onStart={() => {}} />);
    await pickFromSearch(user);

    // The select shows the par the round is actually using, not a nearby one
    // it happens to have an option for.
    const hole3 = screen.getByLabelText('Par for hole 3') as HTMLSelectElement;
    expect(hole3.value).toBe('12');
    await user.selectOptions(hole3, '3');
    expect((screen.getByLabelText('Par for hole 3') as HTMLSelectElement).value).toBe('3');
  });

  it('says nothing extra when the scorecard is clean', async () => {
    const user = userEvent.setup();
    render(<Setup onCancel={() => {}} onStart={() => {}} />);
    await pickFromSearch(user);
    expect(callOut()!.textContent).not.toMatch(/looks off/i);
  });
});

describe('stroke indexes typed in by hand', () => {
  it('are called out when they cannot rank the holes', async () => {
    const user = userEvent.setup();
    render(<Setup onCancel={() => {}} onStart={() => {}} />);
    await openRow(user, 'Holes & pars');
    await user.click(screen.getByRole('button', { name: /Set hole difficulty/i }));

    const hole2 = await screen.findByLabelText('Stroke index for hole 2');
    await user.clear(hole2);
    await user.type(hole2, '1'); // hole 1 already has index 1

    await waitFor(() =>
      expect(document.querySelector('.check-note.bad')?.textContent).toMatch(
        /used more than once/
      )
    );
  });

  it('say nothing while the ranking is sound', async () => {
    const user = userEvent.setup();
    render(<Setup onCancel={() => {}} onStart={() => {}} />);
    await openRow(user, 'Holes & pars');
    await user.click(screen.getByRole('button', { name: /Set hole difficulty/i }));
    await screen.findByLabelText('Stroke index for hole 2');

    expect(document.querySelector('.check-note.bad')).toBeNull();
  });
});

describe('keeping a course you have checked', () => {
  const saveButton = () => screen.getByRole('button', { name: /save this course/i });

  it('is the only save button on the card while it is showing', async () => {
    const user = userEvent.setup();
    render(<Setup onCancel={() => {}} onStart={() => {}} />);
    await pickFromSearch(user);
    // Two buttons doing the same thing raises the question of which is real.
    expect(screen.getAllByRole('button', { name: /save this course/i })).toHaveLength(1);
  });

  it('hands back to the general save button once the course is kept', async () => {
    const user = userEvent.setup();
    render(<Setup onCancel={() => {}} onStart={() => {}} />);
    await pickFromSearch(user);
    await user.click(saveButton());
    await waitFor(() => expect(callOut()).toBeNull());
    expect(screen.getByRole('button', { name: /save this course for next time/i })).toBeTruthy();
  });

  it('is offered right where the checking happens', async () => {
    const user = userEvent.setup();
    render(<Setup onCancel={() => {}} onStart={() => {}} />);
    await pickFromSearch(user);

    // Inside the call-out, not only at the foot of the card.
    expect(callOut()!.querySelector('.check-save')).not.toBeNull();
    expect(saveButton().textContent).toMatch(/looks right/i);
  });

  it('turns the imported course into the copy that loads next time', async () => {
    const user = userEvent.setup();
    render(<Setup onCancel={() => {}} onStart={() => {}} />);
    await pickFromSearch(user);
    await user.click(saveButton());

    const saved = JSON.parse(localStorage.getItem('press.courses.v1') ?? '[]');
    expect(saved).toHaveLength(1);
    expect(saved[0].name).toBe('Bramble Ridge GC');
    expect(saved[0].holes).toHaveLength(18);
    // Par came through, so what is stored is the scorecard as checked.
    expect(saved[0].holes[1].par).toBe(5);
  });

  it('drops the caveat once the course is kept — it has been vouched for', async () => {
    const user = userEvent.setup();
    render(<Setup onCancel={() => {}} onStart={() => {}} />);
    await pickFromSearch(user);
    await user.click(saveButton());

    await waitFor(() => expect(callOut()).toBeNull());
  });

  it('does not pretend a damaged card looks right', async () => {
    stubCourseApi({
      id: 'c1',
      name: COURSE.name,
      holes_data: COURSE.holes_data.map((h, i) => ({ ...h, par: i === 2 ? 12 : h.par })),
    });
    const user = userEvent.setup();
    render(<Setup onCancel={() => {}} onStart={() => {}} />);
    await pickFromSearch(user);

    // Still savable — the user is holding the real card and may know better
    // than the check — but not under a label claiming it looks fine.
    expect(saveButton().textContent).toMatch(/anyway/i);
  });

  it('clears a reported problem as soon as it is fixed', async () => {
    stubCourseApi({
      id: 'c1',
      name: COURSE.name,
      holes_data: COURSE.holes_data.map((h, i) => ({ ...h, par: i === 2 ? 12 : h.par })),
    });
    const user = userEvent.setup();
    render(<Setup onCancel={() => {}} onStart={() => {}} />);
    await pickFromSearch(user);
    expect(callOut()!.textContent).toMatch(/par 12/);

    await user.selectOptions(screen.getByLabelText('Par for hole 3'), '3');

    // The report is re-read from the holes as they stand, not left as it was
    // at import.
    await waitFor(() => expect(callOut()!.textContent).not.toMatch(/par 12/));
    expect(saveButton().textContent).toMatch(/looks right/i);
  });
});
