/**
 * Measures the rendered app for the defects a code review cannot see.
 *
 * Reading a component tells you a control exists; it does not tell you the
 * placeholder is wider than its box, that a button is four pixels tall because
 * the flex row it used to stretch inside is gone, or that eighteen buttons all
 * announce themselves as a number. Every finding this script has reported was
 * invisible in a diff — including one it caught being introduced by the fix for
 * another.
 *
 * The naming half of this is also pinned by `src/a11y.dom.test.tsx`, which runs
 * in CI against happy-dom. What needs a real browser, and so lives here, is
 * everything with a pixel in it: sizes, clipping, overflow.
 *
 *   npm run preview                 # in one terminal
 *   npm run audit:a11y              # in another
 *
 * Playwright is deliberately NOT a dependency — it is a few megabytes and a
 * browser download for a tool you run by hand a few times a year. Install it
 * when you want it:
 *
 *   npm install --no-save playwright && npx playwright install chromium
 *
 * Exits non-zero on a finding that is wrong at any size: a control with no
 * accessible name, a name that says nothing, text clipped by its own box, a
 * sideways scroll, a skipped heading level, a duplicate id, or a tap target
 * under the 24x24 that WCAG 2.5.8 AA asks for. Targets between 24 and 44 are
 * reported without failing, because some of them are justified — eighteen
 * scorecard columns cannot each be 44px on a 390px screen — and a gate that
 * cries wolf is a gate somebody turns off.
 */

const BASE = process.argv[2] ?? 'http://127.0.0.1:4173/';
/** WCAG 2.5.8 AA. Below this is a failure. */
const AA_MIN = 24;
/** A thumb's size. Between AA_MIN and this is reported, not failed. */
const COMFORTABLE = 44;

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  console.error('Playwright is not installed. It is not a dependency of this repo:\n');
  console.error('  npm install --no-save playwright && npx playwright install chromium\n');
  process.exit(2);
}

/* ------------------------------------------------------------------ *
 * Fixtures — enough content that every screen has something to draw
 * ------------------------------------------------------------------ */

// The fixture and the walk are shared with contrast-audit.mjs; see that module.
const { walkScreens } = await import('./auditFixture.mjs');

const AUDIT = ({ aaMin, comfortable }) => {
  const out = { unnamed: [], vague: [], tooSmall: [], snug: [], clipped: [], overflow: [], headings: [], dupIds: [] };
  const clean = (s) => (s ?? '').trim().replace(/\s+/g, ' ');

  /** What a screen reader would call this, in the order browsers resolve it. */
  const accessibleName = (el) => {
    const aria = el.getAttribute('aria-label');
    if (aria) return clean(aria);
    const ref = el.getAttribute('aria-labelledby');
    if (ref) return clean(document.getElementById(ref)?.textContent);
    const title = el.getAttribute('title');
    if (title) return clean(title);
    const text = clean(el.textContent);
    if (text) return text;
    return clean(el.closest('label')?.textContent);
  };

  const where = (el) => `${el.tagName}.${String(el.className).split(' ')[0] || '(no class)'}`;
  /** A name of only digits or a lone glyph names nothing — "1, button". */
  const VAGUE = /^[\d.,:+\-–—✓✕×⋯‹›«»▾▴]{1,3}$/;

  const CONTROLS = 'button, a[href], input, select, textarea, [role=button], [role=radio], [role=checkbox]';
  for (const el of document.querySelectorAll(CONTROLS)) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue; // not rendered
    const name = accessibleName(el);
    if (!name) out.unnamed.push(where(el));
    else if (VAGUE.test(name)) out.vague.push(`"${name}" on ${where(el)}`);

    // An input inside its own <label> is tapped via the label, which is
    // usually much larger — measure whichever the finger actually gets.
    const label = el.tagName === 'INPUT' ? el.closest('label') : null;
    const box = label?.getBoundingClientRect() ?? r;
    const size = `${Math.round(box.width)}x${Math.round(box.height)}`;
    if (box.height < aaMin || box.width < aaMin)
      out.tooSmall.push(`${size} ${where(el)} "${name.slice(0, 24)}"`);
    else if (box.height < comfortable || box.width < comfortable)
      out.snug.push(`${size} ${where(el)} "${name.slice(0, 24)}"`);
  }

  const width = (text, style) => {
    const ctx = document.createElement('canvas').getContext('2d');
    ctx.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    return ctx.measureText(text).width;
  };
  for (const el of document.querySelectorAll('input[placeholder], input[value]')) {
    const s = getComputedStyle(el);
    const inner = el.clientWidth - parseFloat(s.paddingLeft) - parseFloat(s.paddingRight);
    if (el.placeholder && width(el.placeholder, s) > inner + 0.5)
      out.clipped.push(`placeholder "${el.placeholder}" in ${where(el)}`);
    if (el.value && el.scrollWidth > el.clientWidth + 1)
      out.clipped.push(`value "${el.value}" in ${where(el)}`);
  }

  if (document.documentElement.scrollWidth > document.documentElement.clientWidth)
    out.overflow.push(`page is ${document.documentElement.scrollWidth}px wide in ${document.documentElement.clientWidth}px`);

  const hs = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].map((h) => ({
    level: Number(h.tagName[1]),
    text: clean(h.textContent).slice(0, 28),
  }));
  let prev = 0;
  for (const h of hs) {
    if (prev && h.level > prev + 1) out.headings.push(`h${prev} → h${h.level} at "${h.text}"`);
    prev = h.level;
  }
  const h1s = hs.filter((h) => h.level === 1).length;
  if (h1s !== 1) out.headings.push(`${h1s} h1 elements (want exactly 1)`);

  const seen = new Set();
  for (const el of document.querySelectorAll('[id]')) {
    if (seen.has(el.id)) out.dupIds.push(el.id);
    seen.add(el.id);
  }
  return out;
};

/* ------------------------------------------------------------------ *
 * Walking the screens
 * ------------------------------------------------------------------ */

/** Findings that are wrong at any size, and so fail the run. */
const HARD = ['unnamed', 'vague', 'tooSmall', 'clipped', 'overflow', 'headings', 'dupIds'];
const LABELS = {
  unnamed: 'controls with no accessible name',
  vague: 'controls whose name says nothing',
  tooSmall: `tap targets under ${AA_MIN}px (WCAG 2.5.8 AA)`,
  snug: `tap targets between ${AA_MIN} and ${COMFORTABLE}px`,
  clipped: 'text clipped by its own box',
  overflow: 'sideways overflow',
  headings: 'heading structure',
  dupIds: 'duplicate ids',
};

let hardFindings = 0;
let unreachable = 0;

/**
 * Runs one navigation-and-audit step.
 *
 * Catching here is the whole point: a tool that dies on the first screen it
 * cannot reach reports nothing about the eight it could have, and its exit
 * code stops meaning "there is a defect". A step that fails says so and the
 * run carries on.
 */
async function step(screen, navigate, audit) {
  try {
    await navigate();
  } catch (err) {
    unreachable += 1;
    console.log(`\n### ${screen}`);
    console.log(`  ! could not reach this screen: ${String(err).split('\n')[0]}`);
    return;
  }
  report(screen, await audit());
}

function report(screen, found) {
  const lines = [];
  for (const [key, values] of Object.entries(found)) {
    const unique = [...new Set(values)];
    if (!unique.length) continue;
    if (HARD.includes(key)) hardFindings += unique.length;
    const mark = HARD.includes(key) ? '✗' : '·';
    lines.push(`  ${mark} ${LABELS[key]}:`);
    for (const v of unique.slice(0, 10)) lines.push(`      ${v}`);
    if (unique.length > 10) lines.push(`      …and ${unique.length - 10} more`);
  }
  console.log(`\n### ${screen}`);
  console.log(lines.length ? lines.join('\n') : '  clean');
}

const browser = await chromium.launch(
  process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}
);

// 390x844 is a current iPhone; 360 is the narrowest Android worth supporting,
// and is where boxes that are only just wide enough stop being.
for (const width of [390, 360]) {
  const context = await browser.newContext({ viewport: { width, height: 844 } });
  const page = await context.newPage();
  // Run by hand, so a control that is not there should say so in seconds
  // rather than holding the terminal for the default half-minute.
  page.setDefaultTimeout(5000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));

  const audit = () => page.evaluate(AUDIT, { aaMin: AA_MIN, comfortable: COMFORTABLE });
  // walkScreens calls step(label, navigate); this script's step also wants the
  // per-screen audit, which it closes over rather than the walk knowing about.
  await walkScreens({ page, BASE, step: (label, nav) => step(label, nav, audit), width });

  if (errors.length) {
    hardFindings += errors.length;
    console.log(`\n### page errors @ ${width}px`);
    for (const e of [...new Set(errors)]) console.log(`  ✗ ${e}`);
  }
  await context.close();
}

await browser.close();

const verdict = [];
if (hardFindings) verdict.push(`${hardFindings} finding${hardFindings === 1 ? '' : 's'} marked ✗ above`);
// A screen the script could not reach is a hole in the audit, not a pass: the
// app may have changed under it, and silence would read as approval.
if (unreachable) verdict.push(`${unreachable} screen${unreachable === 1 ? '' : 's'} unreachable (marked ! above)`);
console.log(
  `\n${'='.repeat(52)}\n  ${
    verdict.length ? verdict.join(', ') : 'No findings that are wrong at any size.'
  }\n${'='.repeat(52)}`
);
process.exit(verdict.length ? 1 : 0);
