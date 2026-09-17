/**
 * The fixture and the screen walk both audits run against.
 *
 * Two scripts measure this app in a real browser — `a11y-audit.mjs` for naming
 * and tap targets, `contrast-audit.mjs` for colour — and they have to see the
 * same app to be comparable. Kept in one place because a fixture that drifts
 * between them is worse than one audit: two reports that disagree, with no way
 * to tell which is describing the app somebody actually uses.
 */

const PARS = [4, 4, 3, 5, 4, 4, 3, 4, 5, 4, 4, 3, 5, 4, 4, 3, 4, 5];
const SI = [7, 3, 15, 1, 9, 17, 5, 11, 13, 8, 18, 2, 4, 10, 16, 6, 12, 14];
const holes = PARS.map((par, i) => ({ number: i + 1, par, strokeIndex: SI[i] }));
const ids = ['aaa11111', 'bbb22222', 'ccc33333', 'ddd44444'];
const players = ids.map((id, i) => ({
  id,
  name: ['Alex', 'Sam', 'Jordan', 'Casey'][i],
  handicap: [8, 14, 4, 21][i],
}));
const scores = {};
for (const h of holes) {
  scores[h.number] = {};
  players.forEach((p, j) => {
    scores[h.number][p.id] = h.par + ((j + h.number) % 3);
  });
}
const round = (over) => ({
  id: 'r1',
  course: 'Torrey Pines South',
  date: new Date().toISOString().slice(0, 10),
  createdAt: Date.now() - 8e6,
  updatedAt: Date.now(),
  players,
  holes,
  games: ['skins', 'nassau', 'stableford', 'junk'],
  options: {
    useNet: true,
    stablefordMode: 'standard',
    loneWolfMultiplier: 2,
    blindWolfMultiplier: 3,
    stakes: { skins: 5, nassau: 20, stableford: 1 },
    autoPress: true,
    nassau: { mode: '2v2', teamA: [ids[0], ids[1]], teamB: [ids[2], ids[3]] },
  },
  scores,
  // A haul over three holes, one of them a double claim, so the scorecard's
  // junk footer — the longest free-text line the card carries — is on screen
  // when the Card tab is audited rather than only the empty case.
  junk: {
    3: { [ids[0]]: ['greenie'] },
    7: { [ids[0]]: ['sandie', 'barkie'], [ids[1]]: ['chipIn'] },
    12: { [ids[0]]: ['polie'], [ids[2]]: ['greenie'] },
  },
  wolf: {},
  slope: 129,
  rating: 74.6,
  status: 'finished',
  ...over,
});
const courses = [
  { id: 'c1', name: 'Pebble Beach', slope: 129, rating: 74.6, holes },
  // A long name, because the row that holds it used to truncate one.
  { id: 'c2', name: 'Royal County Down Championship Links', holes: holes.slice(0, 9) },
];

/**
 * Two rounds, deliberately distinguishable.
 *
 * One finished and one in progress, because they open different screens — and
 * with different course names from each other and from the saved courses. An
 * earlier version of this script used the same name for a round and a saved
 * course, clicked the wrong one, and audited Play while reporting it as
 * Results.
 */
const rounds = [
  round({ id: 'r1', course: 'Torrey Pines South', updatedAt: Date.now() }),
  round({
    id: 'r2',
    course: 'Cypress Point',
    status: 'in_progress',
    date: '2026-08-01',
    updatedAt: Date.now() - 1e6,
  }),
  // Enough filler to push Home past the five it shows, so the link through to
  // the Rounds screen exists — and spread across months, so its date grouping
  // has more than one heading to draw. Without these the script reported the
  // Rounds screen unreachable, which is the right answer to the wrong fixture.
  ...['Muirfield Village', 'Harbour Town', 'Bethpage Black', 'Oakmont', 'Winged Foot'].map(
    (course, i) =>
      round({
        id: `f${i}`,
        course,
        date: `2026-0${6 - Math.floor(i / 2)}-${String(4 + i * 3).padStart(2, '0')}`,
        updatedAt: Date.now() - (i + 2) * 1e6,
      })
  ),
  // One from a previous season, so the Stats screen's year filter has more
  // than one year to offer and its row gets measured like anything else.
  round({
    id: 'f5',
    course: 'Shinnecock Hills',
    date: '2025-09-10',
    updatedAt: Date.now() - 8e6,
  }),
];

export { holes, ids, players, rounds, courses };

/**
 * Walks every screen, calling `step(label, navigate)` at each one.
 *
 * The caller supplies `step` so it decides what happens on arrival — measure,
 * screenshot, or report — and supplies `width` only so labels can say which
 * viewport a finding came from.
 *
 * `settings` seeds `press.settings.v1` before the first navigation. Glare is
 * the reason it exists: it is a stored preference rather than an OS one, so a
 * browser-level colorScheme cannot reach it and a walk that only sets
 * colorScheme can never see that theme at all.
 */
export async function walkScreens({ page, BASE, step, width, settings }) {
  const at = (screen) => `${screen} @ ${width}px`;

  await page.goto(BASE);
  await page.evaluate(
    ([rounds, saved, prefs]) => {
      localStorage.setItem('press.rounds.v1', JSON.stringify(rounds));
      localStorage.setItem('press.courses.v1', JSON.stringify(saved));
      if (prefs) localStorage.setItem('press.settings.v1', JSON.stringify(prefs));
    },
    [rounds, courses, settings ?? null]
  );
  /** Back to Home, so each screen is reached from a known place. */
  const home = async () => {
    await page.goto(BASE);
    await page.waitForTimeout(500);
  };
  /** The round card for a course, which is not the saved-course row of the same name. */
  const openRound = (course) =>
    page.locator('.round-card .round-main', { hasText: course }).first().click();

  await step(at('Home'), home);

  /* The state a returning user actually lands on, which the every-row-open
     step below never measures: four collapsed rows, the recall chips beside
     "+ Add player", and nothing expanded. */
  await step(
    at('New Round (as opened)'),
    async () => {
      await home();
      await page.getByRole('button', { name: /Start New Round/i }).click();
      await page.waitForTimeout(500);
    }
  );

  await step(
    at('New Round (every row open)'),
    async () => {
      await home();
      await page.getByRole('button', { name: /Start New Round/i }).click();
      await page.waitForTimeout(400);
      for (const row of ['Course', 'Games', 'Holes & pars', 'Money']) {
        await page.getByText(new RegExp(`^${row}$`)).first().click();
      }
      await page.waitForTimeout(500);
    }
  );

  await step(
    at('Golf League'),
    async () => {
      await home();
      await page.getByRole('button', { name: /Golf League/i }).click();
      await page.waitForTimeout(500);
    }
  );

  await step(
    at('Results'),
    async () => {
      await home();
      await openRound('Torrey Pines South'); // the finished one
      await page.waitForTimeout(700);
      await page.getByRole('heading', { name: 'Results' }).waitFor();
    }
  );

  await step(
    at('Share sheet'),
    async () => {
      await page.getByRole('button', { name: 'Share' }).click();
      await page.getByRole('dialog').waitFor();
      await page.waitForTimeout(1400);
    }
  );
  await page.keyboard.press('Escape').catch(() => {});
  await page.waitForTimeout(400);

  await step(
    at('Play — hole'),
    async () => {
      await home();
      await openRound('Cypress Point'); // the one still being played
      await page.waitForTimeout(700);
    }
  );
  /* The junk panel is the densest thing on the Hole tab — a wrap of player
     chips over a wrap of six — and it is only on screen while it is open, so
     nothing above measures it. */
  await step(
    at('Play — claiming junk'),
    async () => {
      await page.locator('.junk.collapsed').click();
      // Waited for rather than slept through: a panel that silently failed to
      // open audits as the screen behind it and reports clean, which is worse
      // than not auditing it at all.
      await page.locator('.junk-kinds').waitFor({ timeout: 4000 });
    }
  );
  await page.locator('.junk-done').click().catch(() => {});
  await page.waitForTimeout(300);

  for (const tab of ['Board', 'Card']) {
    await step(
      at(`Play — ${tab.toLowerCase()}`),
      async () => {
        await page.getByRole('button', { name: new RegExp(`^${tab}$`) }).click();
        await page.waitForTimeout(400);
      },
    );
  }

  await step(
    at('Rounds'),
    async () => {
      await home();
      await page.getByRole('button', { name: /All \d+ rounds/ }).click();
      await page.waitForTimeout(500);
    }
  );

  await step(
    at('Stats'),
    async () => {
      await home();
      await page.getByRole('button', { name: /Stats/ }).click();
      await page.waitForTimeout(500);
    }
  );

  await step(
    at('Settings sheet'),
    async () => {
      await home();
      await page.getByRole('button', { name: /Settings/i }).first().click();
      await page.getByRole('dialog').waitFor();
      await page.waitForTimeout(500);
    }
  );
}
