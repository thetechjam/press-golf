// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LeagueSetup } from './LeagueSetup';
import type { Round, SavedCourse } from '../types';
import { refuseStorageKey } from '../testQuota';

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
      screen.getByText('Enter a handicap for every player — league scoring needs it.')
    ).toBeTruthy();
    expect(started).toHaveLength(0);
  });
});

describe('a team one player short', () => {
  it('starts with the absent slot empty and only the players who are there', async () => {
    const user = userEvent.setup();
    const started = show();
    await user.click(screen.getAllByRole('button', { name: 'Playing a player short?' })[0]);
    await user.click(screen.getByRole('button', { name: 'B absent' }));
    // Al (A), the missing Bo (named but no handicap), Cy and Di.
    const names = [...nameFields()];
    await user.type(names[0], 'Al');
    await user.type(names[1], 'Bo');
    await user.type(names[2], 'Cy');
    await user.type(names[3], 'Di');
    const hcps = hcpFields(); // three: the absent slot has none
    expect(hcps).toHaveLength(3);
    await user.type(hcps[0], '6');
    await user.type(hcps[1], '2');
    await user.type(hcps[2], '8');
    await user.click(screen.getByRole('button', { name: /Start League Round/ }));

    expect(started).toHaveLength(1);
    const [round] = started;
    expect(round.players.map((p) => p.name)).toEqual(['Al', 'Cy', 'Di']);
    const t1 = round.options.league!.teams[0];
    expect(t1.bId).toBe('');
    expect(t1.absent).toBe('b');
    expect(t1.absentName).toBe('Bo');
  });
});

describe('working out a handicap', () => {
  it('applies 70% for a player with fewer than three matches, and fills it in on request', async () => {
    const user = userEvent.setup();
    show();
    await user.type(nameFields()[0], 'Sub');
    await user.click(screen.getByRole('button', { name: /Work out handicap/ }));
    await user.type(screen.getByLabelText('Average over par for Sub'), '6');
    // 0 matches is the default: 6 × 70% = 4.2 → 4.
    await user.click(screen.getByRole('button', { name: /Use 4/ }));
    expect((hcpFields()[0] as HTMLInputElement).value).toBe('4');
  });

  it('applies 90% once they have three or more', async () => {
    const user = userEvent.setup();
    show();
    await user.type(nameFields()[0], 'Sub');
    await user.click(screen.getByRole('button', { name: /Work out handicap/ }));
    await user.type(screen.getByLabelText('Average over par for Sub'), '6');
    await user.click(screen.getByRole('button', { name: '3+' }));
    expect(screen.getByRole('button', { name: /Use 5/ })).toBeTruthy(); // 5.4 → 5
  });

  it("hints at a regular's number from league nights on this phone, without filling it in", async () => {
    const hs = holes.slice(0, 9);
    const night = (id: string, date: string): Round => ({
      id,
      date,
      createdAt: 0,
      updatedAt: 0,
      players: [
        { id: 'x1', name: 'Al', handicap: 5 },
        { id: 'x2', name: 'Bo', handicap: 5 },
        { id: 'x3', name: 'Cy', handicap: 5 },
        { id: 'x4', name: 'Di', handicap: 5 },
      ],
      holes: hs,
      games: [],
      options: {
        useNet: false,
        stakes: {},
        league: {
          pointsPerMatch: 1,
          teams: [
            { aId: 'x1', bId: 'x2' },
            { aId: 'x3', bId: 'x4' },
          ],
        },
      } as Round['options'],
      // Al is 6 over par each night: one over on six holes.
      scores: Object.fromEntries(
        hs.map((h, i) => [h.number, { x1: h.par + (i < 6 ? 1 : 0), x2: h.par, x3: h.par, x4: h.par }])
      ),
      wolf: {},
      status: 'finished',
    });
    localStorage.setItem(
      'press.rounds.v1',
      JSON.stringify(['2026-05-01', '2026-05-08', '2026-05-15'].map((d, i) => night(`r${i}`, d)))
    );
    const user = userEvent.setup();
    show();
    await user.type(nameFields()[0], 'Al');
    // Three nights, so 90% of +6 = 5.4 → 5.
    expect(screen.getByText(/Last 3 league nights here/).textContent).toContain('plays off 5');
    expect((hcpFields()[0] as HTMLInputElement).value).toBe('');
  });
});

describe("a brand-new player's first night", () => {
  it('starts with no handicap for them, to be set from tonight', async () => {
    const user = userEvent.setup();
    const started = show();
    await fillFour(user, [4, 9, 6, 12]);
    // Clear Di's number, then mark it as set from tonight.
    await user.clear(hcpFields()[3]);
    await user.click(screen.getAllByRole('button', { name: /Work out handicap/ })[0]);
    await user.click(screen.getByRole('button', { name: /Set it from tonight/ }));
    expect(screen.getByRole('button', { name: /set from tonight's score/ })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: /Start League Round/ }));

    expect(started).toHaveLength(1);
    const [round] = started;
    const di = round.players.find((p) => p.name === 'Di')!;
    expect(di.handicap).toBeUndefined();
    expect(round.options.league!.firstNight).toEqual([di.id]);
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

describe('saving a league course the phone cannot store', () => {
  it('says so and does not claim the course was saved', async () => {
    const user = userEvent.setup();
    show([]);
    await user.type(document.querySelector('.course-search input')!, 'Thursday');
    await user.click(screen.getByRole('button', { name: /Pars & Stroke Index/ }));
    const restore = refuseStorageKey('press.courses.v1');
    try {
      await user.click(screen.getByRole('button', { name: /Save this course for next time/ }));
      expect(screen.getByRole('alert').textContent).toMatch(/wasn’t kept/);
      expect(screen.queryByText(/Saved "Thursday"/)).toBeNull();
      // Seeded empty before the refusal. The save must not have added the course.
      expect(JSON.parse(localStorage.getItem('press.courses.v1') ?? 'null')).toEqual([]);
    } finally {
      restore();
    }
  });
});

describe('deleting a saved course the phone refuses', () => {
  it('says so instead of throwing, and keeps the course', async () => {
    const user = userEvent.setup();
    show();
    const restore = refuseStorageKey('press.courses.v1');
    try {
      await user.click(screen.getByRole('button', { name: `Delete saved course ${course.name}` }));
      await user.click(
        screen.getByRole('button', { name: `Tap again to delete saved course ${course.name}` })
      );
      expect(screen.getByRole('alert').textContent).toMatch(/wasn’t deleted/);
    } finally {
      restore();
    }
    expect(JSON.parse(localStorage.getItem('press.courses.v1')!)).toHaveLength(1);
  });
});

describe('saving a course loaded to play one nine', () => {
  const storedCourses = (): SavedCourse[] => JSON.parse(localStorage.getItem('press.courses.v1')!);

  it('keeps the whole eighteen and its rating, with the par corrected on screen', async () => {
    const user = userEvent.setup();
    show();
    await loadCourse(user);
    await user.click(screen.getByRole('button', { name: 'Back 9' }));
    await user.click(screen.getByRole('button', { name: /Pars & Stroke Index/ }));
    // Hole 12 is a par 3 on the card; one tap moves it on.
    await user.click(screen.getByRole('button', { name: /^Par for hole 12: / }));
    await user.click(screen.getByRole('button', { name: /Save this course for next time/ }));

    const [kept] = storedCourses();
    expect(kept.id).toBe('c1');
    expect(kept.holes.map((h) => h.number)).toEqual(holes.map((h) => h.number));
    // The eighteen's own stroke indexes, not the nine's 1–9.
    expect(kept.holes.map((h) => h.strokeIndex)).toEqual(holes.map((h) => h.strokeIndex));
    expect(kept.holes[11].par).not.toBe(holes[11].par);
    expect(kept.holes.filter((_, i) => i !== 11).map((h) => h.par)).toEqual(
      holes.filter((_, i) => i !== 11).map((h) => h.par)
    );
    expect(kept.rating).toBe(72);
    expect(kept.slope).toBe(113);
    expect(screen.getByText('Saved "Thursday Night Muni" — all 18 holes')).toBeTruthy();
  });

  it('carries a re-ranked stroke index into the eighteen’s numbers', async () => {
    const user = userEvent.setup();
    show();
    await loadCourse(user);
    await user.click(screen.getByRole('button', { name: /Pars & Stroke Index/ }));
    // Front nine SIs 7,3,15,1,9,17,5,11,13 rank 4,2,8,1,5,9,3,6,7. Swap holes
    // 1 and 2 (ranks 4 and 2).
    const si = (n: number) => screen.getByLabelText(`Stroke index for hole ${n}`);
    await user.clear(si(1));
    await user.type(si(1), '2');
    await user.clear(si(2));
    await user.type(si(2), '4');
    await user.click(screen.getByRole('button', { name: /Save this course for next time/ }));

    const [kept] = storedCourses();
    expect(kept.holes.map((h) => h.strokeIndex)).toEqual([
      3, 7, ...holes.slice(2).map((h) => h.strokeIndex),
    ]);
  });

  it('will not put a different nine over a saved eighteen of the same name', async () => {
    const user = userEvent.setup();
    show();
    await user.type(document.querySelector('.course-search input')!, 'thursday night muni');
    await user.click(screen.getByRole('button', { name: /Pars & Stroke Index/ }));
    await user.click(screen.getByRole('button', { name: /Save this course for next time/ }));

    expect(screen.getByRole('alert').textContent).toMatch(
      /already saved with 18 holes.*different name/
    );
    expect(storedCourses()).toEqual([course]);
  });
});
