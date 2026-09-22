// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Setup } from './Setup';
import type { SavedCourse } from '../types';
import { realCard18 } from '../games/testFixtures';

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
    // Odd across the front nine, even across the back, the way a course
    // allocates them. It used to be ((i * 7) % 18) + 1 — a valid 1..18
    // ranking that splits 5/4, which `scorecardIssues` now reads (correctly)
    // as generated rather than measured.
    handicap_index: [5, 1, 15, 7, 11, 3, 17, 9, 13, 6, 2, 16, 8, 12, 4, 18, 10, 14][i],
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

/**
 * The caveat, specifically — not the confirmation that replaces it.
 *
 * Both are `.check-note`, deliberately: the answer takes the question's slot
 * so the row does not jump. `:not(.saved)` is what keeps "the caveat is gone"
 * from being satisfied by the caveat still being there.
 */
const callOut = () => document.querySelector('.check-note:not(.saved)');
const keptNote = () => document.querySelector('.check-note.saved');
/** A hole's par tile, found by the name a screen reader gives it. */
const parTile = (hole: number) =>
  screen.getByRole('button', { name: new RegExp(`^Par for hole ${hole}: `) });

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

    expect(parTile(2).textContent).toBe('Par for hole 2: 5');
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
    expect(parTile(1)).toBeTruthy();
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
    expect(parTile(7)).toBeTruthy();
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

    // The tile shows the par the round is actually using, however odd, and
    // one tap makes it a real one.
    expect(parTile(3).textContent).toBe('Par for hole 3: 12');
    await user.click(parTile(3));
    expect(parTile(3).textContent).toBe('Par for hole 3: 3');
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

  /**
   * Where the confirmation lands, which is the whole of this.
   *
   * The save button is inside the call-out at the top of Holes & pars; the
   * row's other note slot is below the eighteen-cell par grid, a screenful
   * down. Answering there means the caveat vanishes under the user's finger
   * and nothing appears in its place — the press reads as having done
   * nothing, or worse, as having dismissed a warning.
   */
  it('answers where the button was, not below the par grid', async () => {
    const user = userEvent.setup();
    render(<Setup onCancel={() => {}} onStart={() => {}} />);
    await pickFromSearch(user);

    const before = callOut()!;
    const parent = before.parentElement!;
    const slot = [...parent.children].indexOf(before);

    await user.click(saveButton());
    await waitFor(() => expect(keptNote()).not.toBeNull());

    expect(keptNote()!.textContent).toMatch(/Saved "Bramble Ridge GC"/);
    // Same parent, same position in it: the answer is in the question's slot.
    expect(keptNote()!.parentElement).toBe(parent);
    expect([...parent.children].indexOf(keptNote()!)).toBe(slot);
  });

  it('puts it above the par grid, not after it', async () => {
    const user = userEvent.setup();
    render(<Setup onCancel={() => {}} onStart={() => {}} />);
    await pickFromSearch(user);
    await user.click(saveButton());
    await waitFor(() => expect(keptNote()).not.toBeNull());

    const grid = document.querySelector('.par-grid')!;
    // DOCUMENT_POSITION_FOLLOWING: the grid comes after the note.
    expect(keptNote()!.compareDocumentPosition(grid) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('still answers at the foot when that is the button that was pressed', async () => {
    const user = userEvent.setup();
    render(<Setup onCancel={() => {}} onStart={() => {}} />);
    await pickFromSearch(user);
    // Retire the caveat first, which is what reveals the foot button.
    await user.click(saveButton());
    await waitFor(() => expect(callOut()).toBeNull());

    await user.click(screen.getByRole('button', { name: /save this course for next time/i }));
    // The foot note, not the one in the call-out's old slot.
    await waitFor(() =>
      expect(
        [...document.querySelectorAll('.hint-inline')].some((el) =>
          /Saved "Bramble Ridge GC"/.test(el.textContent ?? '')
        )
      ).toBe(true)
    );
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

    await user.click(parTile(3));

    // The report is re-read from the holes as they stand, not left as it was
    // at import.
    await waitFor(() => expect(callOut()!.textContent).not.toMatch(/par 12/));
    expect(saveButton().textContent).toMatch(/looks right/i);
  });
});

describe('a course with a slope and rating', () => {
  const rate = async (
    user: ReturnType<typeof userEvent.setup>,
    slope: string,
    rating: string
  ) => {
    await openRow(user, 'Holes & pars');
    await user.type(screen.getByLabelText(/^Slope$/i), slope);
    await user.type(screen.getByLabelText(/^Rating$/i), rating);
  };

  const named = async (user: ReturnType<typeof userEvent.setup>, name: string) => {
    const inputs = document.querySelectorAll<HTMLInputElement>('input[placeholder^="Player"]');
    await user.type(inputs[0], name);
  };

  it('asks players for an Index instead of working strokes out themselves', async () => {
    const user = userEvent.setup();
    render(<Setup onCancel={() => {}} onStart={() => {}} />);
    await named(user, 'Al');
    // Unrated: the screen asks for the stroke count, as it always has.
    await user.type(screen.getByLabelText(/^Handicap for Al$/i), '14');

    await rate(user, '131', '74.2');
    await waitFor(() => expect(screen.getByLabelText(/Handicap Index for Al/i)).toBeTruthy());
  });

  it('shows what an Index is worth on these holes', async () => {
    const user = userEvent.setup();
    render(<Setup onCancel={() => {}} onStart={() => {}} />);
    await named(user, 'Al');
    await user.type(screen.getByLabelText(/^Handicap for Al$/i), '1');
    await rate(user, '131', '74.2');

    const index = await screen.findByLabelText(/Handicap Index for Al/i);
    await user.clear(index);
    await user.type(index, '14');

    // 14 × (131/113) + (74.2 − 72) = 18 on a par-72 card. The accessible name
    // says what the number is, rather than leaving a second figure beside the
    // first with nothing to distinguish them.
    await waitFor(() => expect(screen.getByLabelText(/Plays off 18 on these holes/i)).toBeTruthy());
  });

  it('says nothing until both figures are plausible', async () => {
    const user = userEvent.setup();
    render(<Setup onCancel={() => {}} onStart={() => {}} />);
    await named(user, 'Al');
    await user.type(screen.getByLabelText(/^Handicap for Al$/i), '14');

    // A slope on its own cannot convert anything.
    await openRow(user, 'Holes & pars');
    await user.type(screen.getByLabelText(/^Slope$/i), '131');
    expect(screen.queryByLabelText(/Handicap Index for Al/i)).toBeNull();
  });

  it('ignores a rating that belongs to a different number of holes', async () => {
    const user = userEvent.setup();
    render(<Setup onCancel={() => {}} onStart={() => {}} />);
    await named(user, 'Al');
    await user.type(screen.getByLabelText(/^Handicap for Al$/i), '14');
    await openRow(user, 'Holes & pars');
    await user.click(screen.getByRole('button', { name: /^9 holes$/i }));
    // An 18-hole rating left on a nine: close enough to look right, twice what
    // it should be, and not used.
    await user.type(screen.getByLabelText(/^Slope$/i), '131');
    await user.type(screen.getByLabelText(/^Rating$/i), '74.2');

    expect(screen.queryByLabelText(/Handicap Index for Al/i)).toBeNull();
  });
});

describe('handicap allowances', () => {
  it('are offered per game once somebody has a handicap', async () => {
    const user = userEvent.setup();
    render(<Setup onCancel={() => {}} onStart={() => {}} />);
    const inputs = document.querySelectorAll<HTMLInputElement>('input[placeholder^="Player"]');
    await user.type(inputs[0], 'Al');
    await user.type(screen.getByLabelText(/^Handicap for Al$/i), '14');

    // Skins is on by default.
    await waitFor(() =>
      expect(screen.getByLabelText(/Handicap allowance for Skins/i)).toBeTruthy()
    );
  });

  it('are not offered for a game being played off the card', async () => {
    const user = userEvent.setup();
    render(<Setup onCancel={() => {}} onStart={() => {}} />);
    const inputs = document.querySelectorAll<HTMLInputElement>('input[placeholder^="Player"]');
    await user.type(inputs[0], 'Al');
    await user.type(screen.getByLabelText(/^Handicap for Al$/i), '14');
    await screen.findByLabelText(/Handicap allowance for Skins/i);

    // There are no handicap strokes to cut in a gross game.
    await user.click(screen.getByRole('button', { name: 'Gross' }));
    await waitFor(() =>
      expect(screen.queryByLabelText(/Handicap allowance for Skins/i)).toBeNull()
    );
  });
});

describe('telling the two handicap numbers apart', () => {
  it('says which figure is entered and which is worked out', async () => {
    const user = userEvent.setup();
    render(<Setup onCancel={() => {}} onStart={() => {}} />);
    const inputs = document.querySelectorAll<HTMLInputElement>('input[placeholder^="Player"]');
    await user.type(inputs[0], 'Al');
    await user.type(screen.getByLabelText(/^Handicap for Al$/i), '1');

    await openRow(user, 'Holes & pars');
    await user.type(screen.getByLabelText(/^Slope$/i), '113');
    await user.type(screen.getByLabelText(/^Rating$/i), '72');

    const index = await screen.findByLabelText(/Handicap Index for Al/i);
    await user.clear(index);
    await user.type(index, '14');

    // Two numbers sit side by side in the row. Each has to say what it is, or
    // this is the par-over-stroke-index problem again in a different card.
    await waitFor(() => expect(screen.getByLabelText(/Plays off 14/i)).toBeTruthy());
    expect(screen.getByLabelText(/Handicap Index for Al/i)).toBeTruthy();
  });

  it('changes the hint to describe the field actually on screen', async () => {
    const user = userEvent.setup();
    render(<Setup onCancel={() => {}} onStart={() => {}} />);
    const inputs = document.querySelectorAll<HTMLInputElement>('input[placeholder^="Player"]');
    await user.type(inputs[0], 'Al');
    await user.type(screen.getByLabelText(/^Handicap for Al$/i), '14');
    expect(document.body.textContent).toMatch(/Enter handicaps to score net/i);

    await openRow(user, 'Holes & pars');
    await user.type(screen.getByLabelText(/^Slope$/i), '113');
    await user.type(screen.getByLabelText(/^Rating$/i), '72');

    // The box is asking for an Index now, so the hint cannot go on calling it
    // a handicap.
    await waitFor(() => expect(document.body.textContent).toMatch(/Handicap Index/i));
    expect(document.body.textContent).not.toMatch(/Enter handicaps to score net/i);
  });
});

describe('telling you what just happened, where it happened', () => {
  const saved: SavedCourse = {
    id: 'c9',
    name: 'Bramble Ridge GC',
    holes: realCard18(),
  };

  it('confirms a loaded course inside the row you loaded it from', async () => {
    // It used to render once at the foot of the screen, which on a phone put
    // it over a thousand pixels below the fold — a confirmation nobody can see
    // is not a confirmation.
    localStorage.setItem('press.courses.v1', JSON.stringify([saved]));
    const user = userEvent.setup();
    render(<Setup onCancel={() => {}} onStart={() => {}} />);
    await openRow(user, 'Course');
    await user.click(document.querySelector('.saved-course-load')!);

    const note = await screen.findByText('Loaded "Bramble Ridge GC"');
    expect(note.closest('.setup-row')).not.toBeNull();
    expect(
      note.closest('.setup-row')?.querySelector('.setup-row-head')?.textContent
    ).toContain('Course');
  });

  it('confirms a saved course inside the row you saved it from', async () => {
    const user = userEvent.setup();
    render(<Setup onCancel={() => {}} onStart={() => {}} />);
    await openRow(user, 'Course');
    await user.type(document.querySelector('.course-search input')!, 'Muirfield');
    await openRow(user, 'Holes & pars');
    await user.click(screen.getByRole('button', { name: /Save this course for next time/ }));

    const note = await screen.findByText('Saved "Muirfield"');
    expect(
      note.closest('.setup-row')?.querySelector('.setup-row-head')?.textContent
    ).toContain('Holes & pars');
  });

  it('announces the confirmation rather than only drawing it', async () => {
    localStorage.setItem('press.courses.v1', JSON.stringify([saved]));
    const user = userEvent.setup();
    render(<Setup onCancel={() => {}} onStart={() => {}} />);
    await openRow(user, 'Course');
    await user.click(document.querySelector('.saved-course-load')!);

    expect((await screen.findByText('Loaded "Bramble Ridge GC"')).getAttribute('role')).toBe(
      'status'
    );
  });
});

describe('every field says what it is', () => {
  it('names the player inputs, which a placeholder alone does not', async () => {
    // A placeholder is not an accessible name, and it disappears the moment
    // somebody types into the field. Every other input on this screen had an
    // aria-label; the first one on it did not.
    const user = userEvent.setup();
    render(<Setup onCancel={() => {}} onStart={() => {}} />);

    expect(screen.getByRole('textbox', { name: 'Name of player 1' })).toBeTruthy();
    expect(screen.getByRole('textbox', { name: 'Name of player 2' })).toBeTruthy();

    await user.type(screen.getByRole('textbox', { name: 'Name of player 1' }), 'Alex');
    // Still named after the placeholder has gone.
    expect(screen.getByRole('textbox', { name: 'Name of player 1' })).toBeTruthy();
  });

  it('leaves no input on the screen without a name', async () => {
    const user = userEvent.setup();
    render(<Setup onCancel={() => {}} onStart={() => {}} />);
    await openRow(user, 'Course');
    await openRow(user, 'Holes & pars');
    await openRow(user, 'Money');

    const unnamed = [...document.querySelectorAll('input, select')].filter(
      (el) => !el.getAttribute('aria-label') && !el.closest('label')
    );
    expect(unnamed.map((el) => el.className)).toEqual([]);
  });
});

/**
 * Where the Start button lives, and what travels with it.
 *
 * The button is pinned to the bottom of a screen you have to scroll, so an
 * error it produces has to be pinned with it. Left in the flow above the bar
 * it can be scrolled off the screen while the button that wrote it stays in
 * reach — press, nothing happens, no reason given. The markup is the whole
 * guard here: the CSS invariants are in `overscroll.test.ts`.
 */
describe('the pinned Start bar', () => {
  it('holds the button', () => {
    render(<Setup onCancel={() => {}} onStart={() => {}} />);
    const cta = screen.getByRole('button', { name: /Start Round/i });
    expect(cta.closest('.screen-foot')).not.toBeNull();
    // And is the screen's last child, so it has somewhere to stick from.
    const screenEl = document.querySelector('.screen')!;
    expect(screenEl.querySelector(':scope > .screen-foot')).not.toBeNull();
  });

  it('keeps a refusal beside the button that caused it, and says it out loud', async () => {
    const user = userEvent.setup();
    const onStart = vi.fn();
    render(<Setup onCancel={() => {}} onStart={onStart} />);

    await user.click(screen.getByRole('button', { name: /Start Round/i }));
    expect(onStart).not.toHaveBeenCalled();

    const error = document.querySelector('.screen-foot .error')!;
    expect(error).not.toBeNull();
    expect(error.textContent).toContain('player');
    expect(error.getAttribute('role')).toBe('alert');
  });
});

/**
 * How much of the screen the Players card spends.
 *
 * New Round scrolled with every row collapsed, which is the state a returning
 * user lands on — so the shortcuts had to stop costing two rows to say one
 * thing. "+ Add player" and the recall chips both add a single player and now
 * share a line; the chips' visible "Recent" label is gone, which is 55px of
 * the width that decides whether the line holds at 360px.
 *
 * Neither is visible to a unit test as pixels. What is testable is the markup
 * that produces them, and the accessible name the dropped label took with it.
 */
describe('the players card shortcuts', () => {
  const withRound = () => {
    localStorage.setItem(
      'press.rounds.v1',
      JSON.stringify([
        {
          id: 'r0',
          course: 'Torrey Pines South',
          date: '2026-09-01',
          createdAt: 1,
          updatedAt: 1,
          players: [{ id: 'p1', name: 'Alex' }],
          holes: realCard18(),
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
        },
      ])
    );
    render(<Setup onCancel={() => {}} onStart={() => {}} />);
  };

  it('puts the recall chips on the same row as the button they belong beside', () => {
    withRound();
    const row = document.querySelector('.add-row')!;
    expect(row).not.toBeNull();
    expect(row.querySelector('.add')).not.toBeNull();
    expect(row.querySelector('.recent-chips')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Add Alex' }).closest('.add-row')).toBe(row);
  });

  it('names the chip group, now that nothing on screen labels it', () => {
    withRound();
    const group = screen.getByRole('group', { name: /recent/i });
    expect(group.className).toContain('recent-chips');
    // And no visible label left behind to say it twice.
    expect(document.querySelector('.recent-chips-label')).toBeNull();
  });

  it('still opens with every row collapsed once a round has been played', () => {
    withRound();
    for (const row of ['Course', 'Games', 'Holes & pars', 'Money']) expect(rowOpen(row)).toBe(false);
  });
});
