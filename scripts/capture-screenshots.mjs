/**
 * Takes the README screenshots from the real app in a real browser.
 *
 *   npm run build
 *   npm run screenshots:capture        # starts its own preview server
 *
 * Every frame comes out of Chromium running the production build at phone
 * width (390×844 CSS px, device scale 2), seeded with an invented four-ball —
 * Al, Bo, Cy and Di playing Nassau, Skins and Junk for money — so the numbers
 * on screen are the app's own arithmetic, not a mock-up. The same rule as the
 * tutorial footage: a screenshot of a button the app does not have is worse
 * than no screenshot.
 *
 * Playwright is deliberately NOT a dependency of this repo (see the note in
 * a11y-audit.mjs). One-time setup on a machine that takes screenshots:
 *
 *   npm install --no-save playwright
 *   npx playwright install chromium          # or point PLAYWRIGHT_CHROMIUM at
 *                                            # a Chrome/Chromium already installed
 *
 * Output goes to docs/screenshots/*.png and is committed. If ImageMagick's
 * `magick` is on PATH the files are losslessly recompressed on the way out.
 */
import { spawn, execFileSync } from 'node:child_process';
import { mkdir, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(root, 'docs', 'screenshots');
const PORT = 4174;
const BASE = `http://127.0.0.1:${PORT}/`;
const VIEWPORT = { width: 390, height: 844 };

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  console.error('Playwright is not installed. It is not a dependency of this repo:\n');
  console.error('  npm install --no-save playwright && npx playwright install chromium\n');
  process.exit(2);
}

const { holes, ids, courses } = await import('./auditFixture.mjs');

/* ------------------------------------------------------------------ *
 * The four-ball.
 * ------------------------------------------------------------------ */

const localToday = () => {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const players = ids.map((id, i) => ({
  id,
  name: ['Al', 'Bo', 'Cy', 'Di'][i],
  handicap: [8, 14, 4, 21][i],
}));

/** Scores through `thru` holes: par plus 0, 1 or 2, varying so skins change hands. */
const scoresThrough = (thru) => {
  const scores = {};
  for (const h of holes) {
    if (h.number > thru) continue;
    scores[h.number] = {};
    players.forEach((p, j) => {
      scores[h.number][p.id] = h.par + ((j * 2 + h.number) % 3);
    });
  }
  return scores;
};

const round = (over) => ({
  id: 'r1',
  course: 'Torrey Pines South',
  // Local date, as the app writes one — not the UTC date, which is tomorrow
  // every evening west of Greenwich.
  date: localToday(),
  createdAt: Date.now() - 8e6,
  updatedAt: Date.now(),
  players,
  holes,
  games: ['nassau', 'skins', 'junk'],
  options: {
    useNet: true,
    stablefordMode: 'standard',
    loneWolfMultiplier: 2,
    blindWolfMultiplier: 3,
    stakes: { nassau: 10, skins: 5, junk: 2 },
    autoPress: true,
    nassau: { mode: '2v2', teamA: [ids[0], ids[1]], teamB: [ids[2], ids[3]] },
  },
  scores: scoresThrough(18),
  junk: {
    3: { [ids[0]]: ['greenie'] },
    7: { [ids[0]]: ['sandie', 'barkie'], [ids[1]]: ['chipIn'] },
    12: { [ids[3]]: ['polie'], [ids[2]]: ['greenie'] },
  },
  wolf: {},
  presses: [],
  slope: 129,
  rating: 74.6,
  status: 'finished',
  ...over,
});

const seed = {
  rounds: [
    round({ id: 'r1', course: 'Torrey Pines South', updatedAt: Date.now() }),
    round({
      id: 'r2',
      course: 'Cypress Point',
      status: 'in_progress',
      scores: scoresThrough(11),
      junk: { 3: { [ids[0]]: ['greenie'] }, 7: { [ids[1]]: ['chipIn'] } },
      updatedAt: Date.now() - 1e6,
    }),
  ],
  courses,
};

/* ------------------------------------------------------------------ *
 * A preview server of our own, so this is one command.
 * ------------------------------------------------------------------ */

const serve = () => {
  const child = spawn(
    'npx',
    ['vite', 'preview', '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'],
    { cwd: root, stdio: 'ignore' }
  );
  return child;
};

const waitFor = async (url, ms = 20_000) => {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Preview server did not answer at ${url}. Did you run npm run build?`);
};

/* ------------------------------------------------------------------ *
 * Which browser.
 * ------------------------------------------------------------------ */

const chromiumPath = () => {
  if (process.env.PLAYWRIGHT_CHROMIUM) return process.env.PLAYWRIGHT_CHROMIUM;
  for (const bin of ['chromium', 'chromium-browser', 'google-chrome', 'google-chrome-stable']) {
    try {
      return execFileSync('which', [bin], { encoding: 'utf8' }).trim() || undefined;
    } catch {
      // next
    }
  }
  return undefined; // Playwright's own download, if `npx playwright install chromium` ran
};

/* ------------------------------------------------------------------ *
 * The shots.
 * ------------------------------------------------------------------ */

const server = serve();
try {
  await waitFor(BASE);
  await mkdir(OUT, { recursive: true });

  const browser = await chromium.launch({ executablePath: chromiumPath() });
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    acceptDownloads: true,
    colorScheme: 'light',
    reducedMotion: 'reduce',
  });
  await context.addInitScript(`
    localStorage.setItem('press.rounds.v1', ${JSON.stringify(JSON.stringify(seed.rounds))});
    localStorage.setItem('press.courses.v1', ${JSON.stringify(JSON.stringify(seed.courses))});
    localStorage.setItem('press.settings.v1', JSON.stringify({ keepAwake: true, theme: 'light', glare: false, reporterName: '' }));
    // The share sheet hands its PNG to URL.createObjectURL on the way to the
    // OS share sheet or a download; keeping the last blob here is how the
    // real image gets out of a headless browser.
    const make = URL.createObjectURL.bind(URL);
    URL.createObjectURL = (blob) => { window.__lastBlob = blob; return make(blob); };
  `);
  const page = await context.newPage();

  const settle = (ms = 600) => page.waitForTimeout(ms);
  const home = async () => {
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    await settle(400);
  };
  const shot = async (name, opts = {}) => {
    const file = path.join(OUT, `${name}.png`);
    await page.screenshot({ path: file, ...opts });
    console.log(`  ${name}.png`);
  };
  const openRound = (course) =>
    page.locator('.round-card .round-main, .resume-card', { hasText: course }).first().click();

  console.log(`Capturing from ${BASE}`);

  // 1. New Round with last week's crew recalled and a saved course loaded.
  await home();
  await page.getByRole('button', { name: /Start New Round/i }).click();
  await settle();
  await page.getByRole('button', { name: /Al, Bo, Cy/i }).click().catch(() => {});
  await page.getByText(/^Course$/).first().click();
  await settle(300);
  await page.locator('.saved-course-load', { hasText: 'Pebble Beach' }).click();
  await settle();
  // Loading scrolls the Holes row into view; the first impression is the top.
  await page.evaluate(() => window.scrollTo(0, 0));
  await settle(300);
  await shot('setup');

  // 2. The Hole tab, mid-round, with the money ticker.
  await home();
  await openRound('Cypress Point');
  await settle(900);
  await shot('hole');

  // 3. The Board: leaderboards and the money.
  await page.getByRole('button', { name: /^Board$/ }).click();
  await settle();
  await shot('board');

  // 4. Results: the settle-up and the awards. The whole screen, since the
  //    payments sit below the fold on a phone.
  await home();
  await openRound('Torrey Pines South');
  await settle(900);
  await page.getByRole('heading', { name: 'Results' }).waitFor();
  await shot('results', { fullPage: true });

  // 5. The scoreboard image the Share sheet produces: the real PNG the app
  //    draws on its canvas, read back from the blob it makes (see the init
  //    script) — a headless browser has no OS share sheet to hand it to.
  await page.getByRole('button', { name: 'Share' }).click();
  await page.getByRole('dialog').waitFor();
  await settle(800);
  await page.getByRole('button', { name: /^Share results$/i }).click();
  await page.waitForFunction(() => Boolean(window.__lastBlob), null, { timeout: 20_000 });
  const dataUrl = await page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(window.__lastBlob);
      })
  );
  await writeFile(
    path.join(OUT, 'scoreboard.png'),
    Buffer.from(String(dataUrl).split(',')[1], 'base64')
  );
  console.log('  scoreboard.png');

  await browser.close();
} finally {
  server.kill();
}

/* ------------------------------------------------------------------ *
 * Lossless recompression, when ImageMagick is around.
 * ------------------------------------------------------------------ */

let magick = null;
try {
  execFileSync('which', ['magick'], { stdio: 'ignore' });
  magick = 'magick';
} catch {
  // not installed; the PNGs are fine as they are
}
if (magick) {
  for (const f of await readdir(OUT)) {
    if (!f.endsWith('.png')) continue;
    const file = path.join(OUT, f);
    const before = (await stat(file)).size;
    execFileSync(magick, [
      file,
      '-strip',
      '-define',
      'png:compression-level=9',
      '-define',
      'png:exclude-chunk=all',
      file,
    ]);
    const after = (await stat(file)).size;
    console.log(`  ${f}: ${(before / 1024).toFixed(0)} → ${(after / 1024).toFixed(0)} KB`);
  }
}
console.log(`Wrote ${OUT}`);
