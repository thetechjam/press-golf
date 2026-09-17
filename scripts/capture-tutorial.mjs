/**
 * Records the tutorial footage by driving the real app in a real browser.
 *
 * The video on the channel shows the app somebody actually downloads, not a
 * mock-up of it: every frame here comes out of Chromium running the production
 * build. A tutorial that demonstrates a button the app does not have is worse
 * than no tutorial at all, and the only way to be sure is to press the buttons.
 *
 *   npm run build
 *   npm run preview                    # in one terminal
 *   npm run capture:video              # in another
 *
 * Playwright is deliberately NOT a dependency of this repo — see the note in
 * a11y-audit.mjs. Install it when you want to record:
 *
 *   npm install --no-save playwright && npx playwright install chromium
 *
 * One scene per file, because the cut pairs each scene with its own narration
 * clip — a single take would have to be sliced back apart on timings that
 * change every time the voice is regenerated. Scene ids match the headings in
 * docs/video/tutorial-script.md; `--only=07-hole,10-board` records a subset
 * while you are iterating on one.
 *
 * Two things on screen are not live, and both are marked in the manifest:
 *
 *   - The course search (scene 03) is served a canned OpenGolfAPI response.
 *     The UI, the fetch and the parsing are the real ones; the network is not,
 *     so the take is deterministic and does not depend on a third-party API
 *     being up on the day we record.
 *   - The fixture rounds and players are invented. They are the same ones the
 *     audits use, and no real person's card is on screen.
 *
 * Everything else — the scoring, the money, the settlement, the QR code, the
 * handover, the offline reload — is the app doing the thing it does.
 */

import { mkdir, rm, rename, writeFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const BASE = process.argv.find((a) => a.startsWith('http')) ?? 'http://127.0.0.1:4173/';
const OUT = path.resolve(
  process.argv.find((a) => a.startsWith('--out='))?.slice(6) ?? 'video-out'
);
const ONLY = process.argv.find((a) => a.startsWith('--only='))?.slice(7)?.split(',');

/** Portrait phone. The edit composites this centre-frame on a 16:9 canvas. */
const VIEWPORT = { width: 390, height: 844 };
/** Recorded at 2x so the compositor has pixels to spare when it scales. */
const VIDEO = { width: 780, height: 1688 };

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  console.error('Playwright is not installed. It is not a dependency of this repo:\n');
  console.error('  npm install --no-save playwright && npx playwright install chromium\n');
  process.exit(2);
}

const { holes, ids, players, courses } = await import('./auditFixture.mjs');

/* ------------------------------------------------------------------ *
 * Fixtures
 *
 * The video needs states the audits do not: a round part-way through a hole
 * so scoring can be demonstrated rather than described, and one carrying Wolf
 * and Vegas so those controls are on screen. Built here rather than in
 * auditFixture.mjs so the two audits go on measuring exactly what they
 * measured before.
 * ------------------------------------------------------------------ */

const today = new Date().toISOString().slice(0, 10);

/** Scores for holes 1..thru, leaving the rest of the card blank. */
const partialScores = (thru) => {
  const out = {};
  for (const h of holes.filter((h) => h.number <= thru)) {
    out[h.number] = {};
    players.forEach((p, j) => {
      out[h.number][p.id] = h.par + ((j + h.number) % 3) - 1;
    });
  }
  return out;
};

/** The round being scored on camera: five holes in, hole six blank. */
const liveRound = {
  id: 'vid-live',
  course: 'Cypress Point',
  date: today,
  createdAt: Date.now() - 9e6,
  updatedAt: Date.now(),
  players,
  holes,
  games: ['skins', 'nassau', 'junk'],
  options: {
    useNet: true,
    stablefordMode: 'standard',
    loneWolfMultiplier: 2,
    blindWolfMultiplier: 3,
    stakes: { skins: 5, nassau: 20 },
    autoPress: true,
    nassau: { mode: '2v2', teamA: [ids[0], ids[1]], teamB: [ids[2], ids[3]] },
  },
  scores: partialScores(5),
  junk: { 3: { [ids[0]]: ['greenie'] } },
  wolf: {},
  slope: 129,
  rating: 74.6,
  status: 'in_progress',
};

/** Carries Wolf and Vegas, so both sets of controls render on the hole. */
const wolfRound = {
  ...liveRound,
  id: 'vid-wolf',
  course: 'Whistling Straits',
  games: ['wolf', 'vegas', 'skins'],
  options: {
    ...liveRound.options,
    stakes: { wolf: 5, vegas: 1, skins: 5 },
    vegas: { mode: '2v2', teamA: [ids[0], ids[1]], teamB: [ids[2], ids[3]] },
    vegasFlip: true,
  },
  scores: partialScores(3),
};

/** The finished card the Results half of the video is read off. */
const doneRound = {
  ...liveRound,
  id: 'vid-done',
  course: 'Torrey Pines South',
  status: 'finished',
  games: ['skins', 'nassau', 'stableford', 'junk'],
  options: { ...liveRound.options, stakes: { skins: 5, nassau: 20, stableford: 1 } },
  scores: partialScores(18),
  junk: {
    3: { [ids[0]]: ['greenie'] },
    7: { [ids[0]]: ['sandie', 'barkie'], [ids[1]]: ['chipIn'] },
    12: { [ids[0]]: ['polie'], [ids[2]]: ['greenie'] },
  },
};

/* ------------------------------------------------------------------ *
 * A canned OpenGolfAPI, so the search scene is the same every take
 * ------------------------------------------------------------------ */

const API_HITS = {
  courses: [
    { id: 'pebble-beach', name: 'Pebble Beach Golf Links', city: 'Pebble Beach', state: 'CA', par: 72 },
    { id: 'spyglass', name: 'Spyglass Hill Golf Course', city: 'Pebble Beach', state: 'CA', par: 72 },
  ],
};
const API_COURSE = {
  course_name: 'Pebble Beach Golf Links',
  holes_data: holes.map((h) => ({
    number: h.number,
    par: h.par,
    handicap_index: h.strokeIndex,
  })),
};

const stubApi = (context) =>
  context.route('**/api.opengolfapi.org/**', (route) => {
    const url = route.request().url();
    const body = url.includes('/courses/search') ? API_HITS : API_COURSE;
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });

/* ------------------------------------------------------------------ *
 * A visible pointer
 *
 * Chromium records no cursor, so an unannotated take is a phone operating
 * itself: fields fill in, panels open, and nothing says where the thumb went.
 * The dot is drawn into the page and moved to whatever is about to be pressed,
 * which is also why every interaction in a scene goes through `tap()`.
 * ------------------------------------------------------------------ */

const CURSOR = `
  const dot = document.createElement('div');
  dot.id = 'cap-cursor';
  const css = document.createElement('style');
  css.textContent = \`
    #cap-cursor {
      position: fixed; left: 0; top: 0; width: 26px; height: 26px;
      margin: -13px 0 0 -13px; border-radius: 50%;
      background: rgba(231,181,60,.35); border: 2px solid #e7b53c;
      box-shadow: 0 2px 10px rgba(0,0,0,.35);
      pointer-events: none; z-index: 2147483647; opacity: 0;
      transition: transform .32s cubic-bezier(.22,.61,.36,1), opacity .2s;
      transform: translate(-40px, -40px);
    }
    #cap-cursor.on { opacity: 1; }
    #cap-cursor.tap { animation: cap-tap .32s ease-out; }
    @keyframes cap-tap {
      0% { box-shadow: 0 0 0 0 rgba(231,181,60,.55); }
      100% { box-shadow: 0 0 0 22px rgba(231,181,60,0); }
    }
  \`;
  const attach = () => {
    if (!document.body) return;
    document.head.appendChild(css);
    document.body.appendChild(dot);
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', attach);
  } else {
    attach();
  }
  window.__capMove = (x, y) => {
    dot.classList.add('on');
    dot.style.transform = \`translate(\${x}px, \${y}px)\`;
  };
  window.__capTap = () => {
    dot.classList.remove('tap');
    void dot.offsetWidth;
    dot.classList.add('tap');
  };
`;

/* ------------------------------------------------------------------ *
 * Scene helpers
 * ------------------------------------------------------------------ */

const pause = (page, ms) => page.waitForTimeout(ms);

/** Move the pointer onto a thing, then press it — at a pace a viewer can follow. */
async function tap(page, target, { settle = 700 } = {}) {
  const locator = typeof target === 'string' ? page.locator(target) : target;
  await locator.first().scrollIntoViewIfNeeded().catch(() => {});
  const box = await locator.first().boundingBox();
  if (!box) throw new Error(`Nothing to tap: ${locator}`);
  await page.evaluate(
    ([x, y]) => window.__capMove?.(x, y),
    [box.x + box.width / 2, box.y + box.height / 2]
  );
  await pause(page, 380);
  await page.evaluate(() => window.__capTap?.());
  await locator.first().click();
  await pause(page, settle);
}

/** Type into a field the way a person does, pointer first. */
async function fill(page, target, text, { settle = 400 } = {}) {
  const locator = typeof target === 'string' ? page.locator(target) : target;
  const box = await locator.first().boundingBox();
  if (box) {
    await page.evaluate(
      ([x, y]) => window.__capMove?.(x, y),
      [box.x + box.width / 2, box.y + box.height / 2]
    );
    await pause(page, 260);
  }
  await locator.first().click();
  await locator.first().fill('');
  await locator.first().pressSequentially(text, { delay: 70 });
  await pause(page, settle);
}

/** A slow, readable scroll — not a jump cut to the bottom of the screen. */
async function glide(page, selector, distance, ms = 1400) {
  await page.evaluate(
    ([sel, dist, dur]) => {
      const el = sel ? document.querySelector(sel) : null;
      const scroller = el && el.scrollHeight > el.clientHeight ? el : window;
      const start = scroller === window ? window.scrollY : scroller.scrollTop;
      const t0 = performance.now();
      return new Promise((done) => {
        const step = (t) => {
          const k = Math.min(1, (t - t0) / dur);
          const eased = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
          const to = start + dist * eased;
          if (scroller === window) window.scrollTo(0, to);
          else scroller.scrollTop = to;
          if (k < 1) requestAnimationFrame(step);
          else done();
        };
        requestAnimationFrame(step);
      });
    },
    [selector, distance, ms]
  );
  await pause(page, 400);
}

/**
 * Asserts a beat is actually on screen, and fails the take when it is not.
 *
 * Every locator in these scenes sits behind an `if (await count())`, which
 * makes a take that quietly skipped a beat indistinguishable from one that
 * played it: scene 03 recorded a blind scroll past the scorecard check while
 * the narration talked about checking the scorecard, and the recorder printed
 * ✓ every time. Being in the DOM is not the test — being in the viewport is,
 * because that is what the camera sees. A beat the script promises is a beat
 * the recorder checks.
 */
async function shown(page, selector, label = selector) {
  const box = await page
    .locator(selector)
    .first()
    .boundingBox()
    .catch(() => null);
  const height = page.viewportSize().height;
  if (!box || box.y >= height || box.y + box.height <= 0) {
    throw new Error(`Not on screen: ${label} — ${box ? 'scrolled out of frame' : 'no such element'}`);
  }
}

/**
 * Brings something to a comfortable place on screen, at reading pace.
 *
 * `scrollIntoViewIfNeeded` jumps, and a jump reads as a cut — fine for `tap`,
 * where the press that follows explains it, wrong when the point of the shot
 * is the thing arriving. Works out the distance and hands it to `glide` so the
 * eye can follow it up the screen.
 *
 * Returns false when the element is not there rather than throwing, and does
 * it in four seconds rather than Playwright's default thirty — a missing beat
 * should fail the take promptly, and `shown()` is what decides that it has.
 */
async function reveal(page, selector, { top = 120, ms = 1200 } = {}) {
  const box = await page
    .locator(selector)
    .first()
    .boundingBox({ timeout: 4000 })
    .catch(() => null);
  if (!box) return false;
  await glide(page, null, box.y - top, ms);
  return true;
}

/**
 * Keeps a take rolling until it is as long as the narration it will carry.
 *
 * The cut pairs each take with its voice clip, and a take that runs out first
 * leaves the editor holding a frozen frame for the rest of the line — on the
 * worst scene here that was fourteen seconds of still image under half the
 * narration. Stretching the footage instead only trades the freeze for a
 * crawl. So the take itself covers the line: once the scripted actions are
 * done, the screen goes on moving — a slow look down the screen and back —
 * until the scene has played for as long as the voice will.
 *
 * `target` comes from the generated narration, so it is measured rather than
 * guessed; scenes whose actions already outrun their line simply return.
 */
async function fillTo(page, startedAt, targetMs, selector = null) {
  const left = () => targetMs - (Date.now() - startedAt);
  while (left() > 2600) {
    await glide(page, selector, 300, 1500);
    if (left() > 2600) await glide(page, selector, -300, 1500);
  }
  if (left() > 300) await pause(page, left());
}

/** The score chip for a number, inside one player's row. */
const chip = (page, playerId, n) =>
  page.locator(`#player-row-${playerId} button[aria-label^="${n},"]`).first();

/* ------------------------------------------------------------------ *
 * The scenes
 * ------------------------------------------------------------------ */

/** Carried from the share scene to the arrival scene. */
let handoverUrl = null;

const scenes = [
  {
    id: '01-cold-open',
    target: 24.0,
    title: 'Cold open — a phone with no rounds on it',
    seed: { rounds: [], courses: [] },
    async run(page) {
      await pause(page, 2600);
      await glide(page, null, 220, 1200);
      await pause(page, 1800);
      await glide(page, null, -220, 900);
      await pause(page, 1200);
    },
  },
  {
    id: '02-players',
    target: 16.0,
    title: 'Adding players and handicaps',
    seed: { rounds: [], courses },
    async run(page) {
      await pause(page, 900);
      await tap(page, page.getByRole('button', { name: /Start New Round/i }));
      await fill(page, '.player-row:nth-of-type(1) .player-name', 'Alex');
      await fill(page, '.player-row:nth-of-type(1) input[placeholder="HCP"]', '8');
      await fill(page, '.player-row:nth-of-type(2) .player-name', 'Sam');
      await fill(page, '.player-row:nth-of-type(2) input[placeholder="HCP"]', '14');
      await tap(page, page.getByRole('button', { name: /\+ Add player/i }));
      await fill(page, '.player-row:nth-of-type(3) .player-name', 'Jordan');
      await fill(page, '.player-row:nth-of-type(3) input[placeholder="HCP"]', '4');
      await tap(page, page.getByRole('button', { name: /\+ Add player/i }));
      await fill(page, '.player-row:nth-of-type(4) .player-name', 'Casey');
      await fill(page, '.player-row:nth-of-type(4) input[placeholder="HCP"]', '21');
      await pause(page, 1600);
    },
  },
  {
    id: '03-course',
    target: 26.1,
    title: 'Loading a course, and checking the card',
    seed: { rounds: [], courses },
    stubApi: true,
    async run(page) {
      await tap(page, page.getByRole('button', { name: /Start New Round/i }));
      await tap(page, page.getByText(/^Course$/).first());
      const search = page.locator('.setup .card input[type="text"], .course-search input').first();
      if (await search.count()) {
        await fill(page, search, 'Pebble', { settle: 1400 });
        const hit = page.getByText(/Pebble Beach Golf Links/).first();
        if (await hit.count()) await tap(page, hit, { settle: 1600 });
      }
      // The load opens Holes & pars itself — and this is the part the take
      // used to scroll past while the narration talked about it. A blind
      // 300px glide landed wherever the row happened to be; the audit is
      // named here so the shot cannot miss it again.
      //
      // Three beats, in the order somebody actually checks a card: the note
      // that says check it (and lists what already looks wrong, when search
      // data is wrong), then the eighteen pars and stroke indexes themselves,
      // then vouching for it.
      await reveal(page, '.check-note', { top: 90 });
      await shown(page, '.check-note', 'the check-the-card note');
      await pause(page, 2800);

      await reveal(page, '.par-grid', { top: 150, ms: 1500 });
      await shown(page, '.par-grid', 'the pars and stroke indexes');
      await pause(page, 1800);
      await glide(page, null, 280, 1800);
      await pause(page, 2000);

      // Saving is what retires the caveat: the gold note becomes the green
      // one in the same slot, and from here their copy is the one that loads.
      // Worth the shot because it is the only way the warning goes away.
      await reveal(page, '.check-save', { top: 320, ms: 1100 });
      await tap(page, page.locator('.check-save'), { settle: 2400 });
      await shown(page, '.check-note.saved', 'the saved confirmation');
    },
  },
  {
    id: '04-games',
    target: 15.0,
    title: 'Picking the games, and the rules behind the info button',
    seed: { rounds: [], courses },
    async run(page) {
      await tap(page, page.getByRole('button', { name: /Start New Round/i }));
      await tap(page, page.getByText(/^Games$/).first());
      for (const g of ['Nassau', 'Stableford']) {
        const card = page.locator('.game-card', { hasText: new RegExp(`^${g}`) }).first();
        if (await card.count()) await tap(page, card, { settle: 550 });
      }
      const info = page.locator('.game-card', { hasText: /Nassau/ }).locator('.game-info-btn').first();
      if (await info.count()) await tap(page, info, { settle: 2600 });
      await pause(page, 1200);
    },
  },
  {
    id: '05-formats',
    target: 29.2,
    title: 'The whole format list, and net scoring',
    seed: { rounds: [], courses },
    async run(page) {
      await tap(page, page.getByRole('button', { name: /Start New Round/i }));
      await fill(page, '.player-row:nth-of-type(1) input[placeholder="HCP"]', '8', { settle: 200 });
      await tap(page, page.getByText(/^Games$/).first());
      await glide(page, null, 420, 2200);
      await pause(page, 1400);
      await glide(page, null, 420, 2200);
      await pause(page, 2400);
    },
  },
  {
    id: '06-money',
    target: 12.9,
    title: 'Setting the stakes',
    seed: { rounds: [], courses },
    async run(page) {
      await tap(page, page.getByRole('button', { name: /Start New Round/i }));
      await tap(page, page.getByText(/^Money$/).first());
      const stakes = page.locator('.stakes-editor input, .setup input[inputmode="decimal"]');
      const n = await stakes.count();
      if (n) await fill(page, stakes.nth(0), '5');
      if (n > 1) await fill(page, stakes.nth(1), '20');
      await pause(page, 1800);
    },
  },
  {
    id: '07-hole',
    target: 22.0,
    title: 'Scoring a hole',
    seed: { rounds: [liveRound], courses },
    async run(page) {
      await tap(page, page.locator('.round-card .round-main', { hasText: 'Cypress Point' }).first(), {
        settle: 1200,
      });
      await pause(page, 1400);
      await tap(page, chip(page, ids[0], 4), { settle: 500 });
      await tap(page, chip(page, ids[1], 5), { settle: 500 });
      await tap(page, chip(page, ids[2], 3), { settle: 900 });
      await pause(page, 1600);
    },
  },
  {
    id: '08-ticker',
    target: 13.3,
    title: 'The live money ticker',
    seed: { rounds: [liveRound], courses },
    async run(page) {
      await tap(page, page.locator('.round-card .round-main', { hasText: 'Cypress Point' }).first(), {
        settle: 1000,
      });
      for (const [i, n] of [4, 5, 3, 5].entries()) {
        await tap(page, chip(page, ids[i], n), { settle: 450 });
      }
      await pause(page, 1800);
      await tap(page, page.getByRole('button', { name: /Next Hole/i }), { settle: 1600 });
      await pause(page, 1400);
    },
  },
  {
    id: '09-junk-wolf',
    target: 19.5,
    title: 'Junk, Wolf and presses',
    seed: { rounds: [liveRound, wolfRound], courses },
    async run(page) {
      await tap(page, page.locator('.round-card .round-main', { hasText: 'Cypress Point' }).first(), {
        settle: 1000,
      });
      const junk = page.locator('.junk.collapsed').first();
      if (await junk.count()) {
        await tap(page, junk, { settle: 900 });
        const kinds = page.locator('.junk-kinds button');
        if (await kinds.count()) {
          await tap(page, kinds.nth(0), { settle: 700 });
          if ((await kinds.count()) > 1) await tap(page, kinds.nth(1), { settle: 900 });
        }
        const done = page.locator('.junk-done').first();
        if (await done.count()) await tap(page, done, { settle: 900 });
      }
      await pause(page, 1200);
      // The Wolf round, for the controls the Cypress card does not carry.
      await tap(page, page.getByRole('button', { name: 'Back to rounds' }), { settle: 900 });
      await tap(
        page,
        page.locator('.round-card .round-main', { hasText: 'Whistling Straits' }).first(),
        { settle: 1400 }
      );
      await pause(page, 2600);
    },
  },
  {
    id: '10-board',
    target: 16.5,
    title: 'The Board — every game at once',
    seed: { rounds: [liveRound], courses },
    async run(page) {
      await tap(page, page.locator('.round-card .round-main', { hasText: 'Cypress Point' }).first(), {
        settle: 1000,
      });
      await tap(page, page.getByRole('button', { name: /^Board$/ }), { settle: 1600 });
      await glide(page, null, 380, 2000);
      await pause(page, 1600);
      await glide(page, null, 380, 2000);
      await pause(page, 2000);
    },
  },
  {
    id: '11-card',
    target: 9.2,
    title: 'The scorecard',
    seed: { rounds: [doneRound], courses },
    async run(page) {
      await tap(
        page,
        page.locator('.round-card .round-main', { hasText: 'Torrey Pines South' }).first(),
        { settle: 1200 }
      );
      await tap(page, page.getByRole('button', { name: 'Back to the scorecard' }), { settle: 1400 });
      await tap(page, page.getByRole('button', { name: /^Card$/ }), { settle: 1600 });
      await glide(page, '.scorecard-scroll', 260, 1800);
      await pause(page, 2200);
    },
  },
  {
    id: '12-results',
    target: 22.3,
    title: 'Results and awards',
    seed: { rounds: [doneRound], courses },
    async run(page) {
      await tap(
        page,
        page.locator('.round-card .round-main', { hasText: 'Torrey Pines South' }).first(),
        { settle: 2000 }
      );
      await pause(page, 2400);
      await glide(page, null, 340, 1800);
      await pause(page, 2800);
    },
  },
  {
    id: '13-settlement',
    target: 14.8,
    title: 'Settling up',
    seed: { rounds: [doneRound], courses },
    async run(page) {
      await tap(
        page,
        page.locator('.round-card .round-main', { hasText: 'Torrey Pines South' }).first(),
        { settle: 1400 }
      );
      await glide(page, null, 620, 2200);
      await pause(page, 3400);
      await glide(page, null, 340, 1600);
      await pause(page, 2200);
    },
  },
  {
    id: '14-share',
    target: 7.6,
    title: 'Sharing the result',
    seed: { rounds: [doneRound], courses },
    async run(page) {
      await tap(
        page,
        page.locator('.round-card .round-main', { hasText: 'Torrey Pines South' }).first(),
        { settle: 1400 }
      );
      await tap(page, page.getByRole('button', { name: /^Share$/ }), { settle: 1800 });
      await page.getByRole('dialog').waitFor();
      await pause(page, 2600);
    },
  },
  {
    id: '15-qr',
    target: 17.7,
    title: 'The round in a QR code',
    seed: { rounds: [doneRound], courses },
    permissions: ['clipboard-read', 'clipboard-write'],
    async run(page) {
      await tap(
        page,
        page.locator('.round-card .round-main', { hasText: 'Torrey Pines South' }).first(),
        { settle: 1200 }
      );
      await tap(page, page.getByRole('button', { name: /^Share$/ }), { settle: 1200 });
      await page.getByRole('dialog').waitFor();
      await page.locator('.share-qr, svg').first().waitFor({ timeout: 15000 }).catch(() => {});
      await glide(page, '.sheet-body', 300, 1600).catch(() => {});
      await pause(page, 2600);
      const send = page.getByRole('button', { name: /Send the link/i });
      if (await send.count()) {
        await tap(page, send, { settle: 1600 });
        // The link is what the next scene opens: in a browser with no system
        // share sheet, sendLink() falls back to the clipboard, so that is
        // where the round is. Read rather than rebuilt — a hand-assembled URL
        // would be testing this script's encoder, not the app's.
        handoverUrl = await page
          .evaluate(() => navigator.clipboard.readText())
          .catch(() => null);
      }
      await pause(page, 1600);
    },
  },
  {
    id: '16-arrival',
    target: 22.7,
    title: 'The round arriving on another phone',
    seed: { rounds: [], courses: [] },
    async run(page) {
      if (!handoverUrl) {
        console.warn('  ! no handover link captured — skipping the arrival take');
        await pause(page, 600);
        return;
      }
      await page.goto(handoverUrl);
      await page.waitForSelector('.screen', { timeout: 20000 });
      await pause(page, 3000);
      await glide(page, null, 240, 1400);
      await pause(page, 1600);
      const keep = page.getByRole('button', { name: /Keep it|Take it on/ });
      if (await keep.count()) await tap(page, keep, { settle: 2200 });
      await pause(page, 1600);
    },
  },
  {
    id: '17-offline',
    target: 22.7,
    title: 'With the network switched off',
    seed: { rounds: [doneRound, liveRound], courses },
    async run(page, context) {
      await pause(page, 1200);
      // Wait for the service worker to be activated before the network goes
      // away — the same wait a phone does on its first visit.
      //
      // Polled from here rather than with waitForFunction: the predicate has
      // to await getRegistration(), and waitForFunction sees the promise
      // itself as a truthy result and resolves on the first tick. That reads
      // as a pass, goes offline before anything is cached, and records a
      // reload that quietly failed — the take then shows the pre-reload page
      // and claims it is proof of offline support. It is worth being exact
      // about: this scene only means anything if the reload is real.
      //
      // `controller` is the wrong thing to wait for at all here — the app
      // registers with registerType 'prompt', so the first page load is never
      // controlled, however long you wait.
      let swReady = false;
      for (let i = 0; i < 30 && !swReady; i++) {
        swReady = await page
          .evaluate(async () => !!(await navigator.serviceWorker?.getRegistration())?.active)
          .catch(() => false);
        if (!swReady) await pause(page, 1000);
      }
      if (!swReady) throw new Error('service worker never activated — offline take would be a lie');
      await pause(page, 1200);
      await context.setOffline(true);
      // Proof, in the take's own log, that the network is actually gone.
      const netDead = await page.evaluate(() =>
        fetch('/manifest.webmanifest', { cache: 'no-store' })
          .then(() => false)
          .catch(() => true)
      );
      if (!netDead) throw new Error('still online after setOffline — offline take would be a lie');
      await pause(page, 900);
      const reload = await page.reload({ waitUntil: 'domcontentloaded' }).catch((e) => ({ e }));
      if (reload?.e) throw new Error(`offline reload failed: ${String(reload.e).split('\n')[0]}`);
      await page.waitForSelector('.screen', { timeout: 20000 });
      await pause(page, 2600);
      await tap(
        page,
        page.locator('.round-card .round-main', { hasText: 'Cypress Point' }).first(),
        { settle: 1800 }
      );
      await tap(page, page.getByRole('button', { name: /^Board$/ }), { settle: 2400 });
      await pause(page, 1800);
      await context.setOffline(false);
    },
  },
  {
    id: '18-close',
    target: 13.3,
    title: 'Close — add it to your home screen',
    seed: { rounds: [doneRound], courses },
    async run(page) {
      await pause(page, 1600);
      await glide(page, null, 300, 1600);
      await pause(page, 3000);
    },
  },
];

/* ------------------------------------------------------------------ *
 * Runner
 * ------------------------------------------------------------------ */

const seedScript = (seed) => `
  try {
    localStorage.setItem('press.rounds.v1', ${JSON.stringify(JSON.stringify(seed.rounds ?? []))});
    localStorage.setItem('press.courses.v1', ${JSON.stringify(JSON.stringify(seed.courses ?? []))});
  } catch {}
`;

/**
 * The browser to drive.
 *
 * Playwright normally downloads a build pinned to its own version. Where one
 * is already on the machine — a CI image, a container that ships Chromium —
 * that download is both unnecessary and, on a version skew, the thing that
 * stops this running at all. PLAYWRIGHT_CHROMIUM overrides; otherwise the
 * newest build under PLAYWRIGHT_BROWSERS_PATH is used, and failing that
 * Playwright's own default.
 */
const chromiumPath = async () => {
  if (process.env.PLAYWRIGHT_CHROMIUM) return process.env.PLAYWRIGHT_CHROMIUM;
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (!root) return undefined;
  const builds = (await readdir(root).catch(() => []))
    .filter((d) => /^chromium-\d+$/.test(d))
    .sort((a, b) => Number(b.split('-')[1]) - Number(a.split('-')[1]));
  return builds.length ? path.join(root, builds[0], 'chrome-linux', 'chrome') : undefined;
};

// The screencast Playwright records from works in CSS pixels, so a context
// deviceScaleFactor buys nothing: the frames arrive at 390x844 and get letter-
// boxed into whatever video size is asked for. Forcing it at the browser is
// what actually doubles the pixels, and 780x1688 is enough to sit on a 1080p
// canvas without being upscaled.
const browser = await chromium.launch({
  executablePath: await chromiumPath(),
  args: ['--force-device-scale-factor=2'],
});
await mkdir(OUT, { recursive: true });
const raw = path.join(OUT, '.raw');
await rm(raw, { recursive: true, force: true });
await mkdir(raw, { recursive: true });

const manifest = [];
const picked = scenes.filter((s) => !ONLY || ONLY.includes(s.id));

console.log(`Recording ${picked.length} scene(s) from ${BASE}\n`);

for (const scene of picked) {
  const started = Date.now();
  process.stdout.write(`  ${scene.id.padEnd(14)} ${scene.title}`);

  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    recordVideo: { dir: raw, size: VIDEO },
    permissions: scene.permissions ?? [],
    // The clipboard fallback in shareTarget.ts only runs when there is no
    // system share sheet, which is exactly the case in a headless browser.
    colorScheme: 'light',
  });
  await context.addInitScript(seedScript(scene.seed ?? {}));
  await context.addInitScript(CURSOR);
  if (scene.stubApi) await stubApi(context);

  const page = await context.newPage();
  let failure = null;
  try {
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.screen', { timeout: 20000 });
    await pause(page, 700);
    const rolling = Date.now();
    await scene.run(page, context);
    // PREROLL: the context, the navigation and the first paint are already on
    // the tape by the time `run` is called, and they are part of what the
    // narration has to cover.
    if (scene.target) await fillTo(page, rolling, scene.target * 1000 - 1500);
  } catch (err) {
    failure = err?.message ?? String(err);
  }

  const video = page.video();
  await context.close();

  let file = null;
  if (video) {
    const from = await video.path();
    file = `${scene.id}.webm`;
    await rename(from, path.join(OUT, file)).catch(async () => {
      file = path.basename(from);
    });
  }

  manifest.push({
    id: scene.id,
    title: scene.title,
    file,
    ms: Date.now() - started,
    ok: !failure,
    error: failure,
  });
  console.log(failure ? `  ✗ ${failure.split('\n')[0]}` : '  ✓');
}

await rm(raw, { recursive: true, force: true }).catch(() => {});
await writeFile(
  path.join(OUT, 'scenes.json'),
  JSON.stringify(
    {
      base: BASE,
      viewport: VIEWPORT,
      video: VIDEO,
      recorded: new Date().toISOString(),
      handoverUrlCaptured: Boolean(handoverUrl),
      notes: [
        'Course search (03) is served a canned OpenGolfAPI response; the UI, the parsing and the scorecard check are live.',
        'Players and rounds are fixtures — no real card is on screen.',
      ],
      scenes: manifest,
    },
    null,
    2
  ) + '\n'
);

await browser.close();

const failed = manifest.filter((s) => !s.ok);
console.log(`\n${manifest.length - failed.length}/${manifest.length} scenes recorded → ${OUT}`);
console.log(`Files: ${(await readdir(OUT)).filter((f) => f.endsWith('.webm')).length} .webm`);
if (failed.length) {
  console.error(`\nFailed: ${failed.map((s) => s.id).join(', ')}`);
  process.exit(1);
}
