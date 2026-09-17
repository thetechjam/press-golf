/**
 * Measures colour contrast in a real browser, on every screen, in both themes.
 *
 * `a11y-audit.mjs` measures names and tap targets; nothing measured colour, and
 * colour is where this app had a systemic problem nobody could see by reading
 * the CSS. The accent greens are named for their place on a lightness ramp
 * (--green-600, --green-700), so a rule saying `color: var(--green-700)` looks
 * correct on any screen you read it on. It is only wrong once the theme under
 * it is dark, and only measurably so.
 *
 * Two rules this script had to learn the hard way, both of which produced
 * confident and completely wrong numbers first:
 *
 * 1. Resolve colours by painting them. Reading computed values as text breaks
 *    the moment one arrives as `color(srgb 0.9 0.97 0.94)`, whose channels are
 *    0..1 — parsed as 0..255 that is near-black, and every light surface in the
 *    app reports as a contrast failure.
 * 2. Composite the whole stack. A tinted pill inside a tinted row is two
 *    translucent greens deep, and measuring it against the nearest opaque
 *    ancestor misses the layer in between — which is exactly where the last
 *    two real findings were hiding.
 *
 * Elements over a background image or gradient are skipped rather than
 * guessed at: their backdrop is not knowable from computed style, and a
 * guessed number is worse than an absent one.
 *
 * Usage:  npm run preview   (in one terminal)
 *         npm run audit:contrast
 */

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  console.error('This script needs Playwright:  npm install --no-save playwright');
  process.exit(1);
}

const { walkScreens } = await import('./auditFixture.mjs');

const BASE = process.argv[2] ?? 'http://127.0.0.1:4173/';

const CONTRAST = () => {
  // Any CSS colour syntax -> 0..255 RGBA, by letting the browser paint it.
  // Reading computed values textually breaks the moment a colour arrives as
  // `color(srgb 0.9 0.97 0.94)`, whose channels are 0..1: parsed as 0..255
  // that is near-black, and every light surface reports as a contrast failure.
  const cv = document.createElement('canvas');
  cv.width = cv.height = 1;
  const cx = cv.getContext('2d', { willReadFrequently: true });
  const cache = new Map();
  const toRGBA = (css) => {
    if (cache.has(css)) return cache.get(css);
    cx.clearRect(0, 0, 1, 1);
    cx.fillStyle = '#000';
    cx.fillStyle = css;
    const resolved = cx.fillStyle;
    cx.clearRect(0, 0, 1, 1);
    cx.fillStyle = resolved;
    cx.fillRect(0, 0, 1, 1);
    const d = cx.getImageData(0, 0, 1, 1).data;
    const out = [d[0], d[1], d[2], d[3] / 255];
    cache.set(css, out);
    return out;
  };

  const lum = (rgb) => {
    const [r, g, b] = rgb.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const over = (fg, a, bg) => [0, 1, 2].map((i) => fg[i] * a + bg[i] * (1 - a));
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

  // Composite every translucent layer from the page down, so a chip tinted
  // over a card over the page resolves to what the eye actually sees.
  const bgOf = (el) => {
    const layers = [];
    for (let n = el; n; n = n.parentElement) {
      const c = toRGBA(getComputedStyle(n).backgroundColor);
      if (c[3] > 0) layers.push(c);
      if (c[3] === 1) break;
    }
    let base = [255, 255, 255];
    for (let i = layers.length - 1; i >= 0; i -= 1) base = over(layers[i], layers[i][3], base);
    return base;
  };

  const out = [];
  let measured = 0;
  for (const el of document.querySelectorAll('*')) {
    const own = [...el.childNodes].filter((n) => n.nodeType === 3 && n.textContent.trim()).map((n) => n.textContent.trim()).join(' ');
    if (!own) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none') continue;
    const op = parseFloat(cs.opacity);
    if (op === 0) continue;
    if (el.closest('[aria-hidden="true"]')) continue;
    // A background image (gradient, pattern) makes the effective backdrop
    // unknowable from computed style; skip rather than report a guess.
    let hasImg = false;
    for (let n = el; n; n = n.parentElement) {
      const bi = getComputedStyle(n).backgroundImage;
      if (bi && bi !== 'none') { hasImg = true; break; }
      if (toRGBA(getComputedStyle(n).backgroundColor)[3] === 1) break;
    }
    if (hasImg) continue;

    const bg = bgOf(el);
    const fgRaw = toRGBA(cs.color);
    const fg = over(fgRaw, fgRaw[3] * (op || 1), bg);
    const size = parseFloat(cs.fontSize);
    const weight = Number(cs.fontWeight) || 400;
    const large = size >= 24 || (size >= 18.66 && weight >= 700);
    const need = large ? 3 : 4.5;
    const got = ratio(fg, bg);
    const off = el.closest('button:disabled, [aria-disabled="true"]');
    measured += 1;
    if (got < need && !off) {
      out.push({ text: own.slice(0, 40), cls: el.className?.toString?.().slice(0, 40) || el.tagName,
                 got: +got.toFixed(2), need, size: +size.toFixed(1), weight,
                 fg: fg.map(Math.round).join(','), bg: bg.map(Math.round).join(',') });
    }
  }
  // The theme class ONLY. Reading the whole className folds in transient ones
  // like `sheet-open`, which is enough to make three collapsed themes look like
  // four distinct palettes and hide exactly the failure this reports.
  const rc = document.documentElement.classList;
  const theme = rc.contains('glare') ? 'glare' : rc.contains('dark') ? 'dark' : 'light';
  return { measured, findings: out, theme };
};

const browser = await chromium.launch(
  process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}
);

// Keyed by theme + element + text, so one finding is reported once however
// many screens it appears on — the accent-green problem showed up seventeen
// times across five screens and is one fix.
const seen = new Map();
const unreachable = [];
// A contrast audit that measured nothing reports exactly the same "clean" as one
// that measured everything. This is what tells the two apart — and what would
// have caught the walk silently painting the same theme three times.
const coverage = new Map();

// Themes are seeded as the app's own stored preference rather than left to the
// browser's colorScheme, because one of the three is not an OS preference at
// all. Glare is a Settings toggle that paints a max-contrast light palette for
// direct sun — the one theme where a contrast miss actually costs somebody a
// read, and the one no audit had ever looked at.
const THEMES = [
  { name: 'light', settings: { theme: 'light', glare: false } },
  { name: 'dark', settings: { theme: 'dark', glare: false } },
  { name: 'glare', settings: { theme: 'light', glare: true } },
];

for (const { name: scheme, settings } of THEMES) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    // Kept aligned with the stored theme so anything keyed off the media query
    // (a native control, a scrollbar) matches the palette being painted.
    colorScheme: scheme === 'dark' ? 'dark' : 'light',
  });
  const page = await context.newPage();
  page.setDefaultTimeout(5000);

  const step = async (label, navigate) => {
    try {
      await navigate();
    } catch (e) {
      unreachable.push(`${scheme} ${label}: ${e.message.split('\n')[0]}`);
      return;
    }
    const { measured, findings, theme } = await page.evaluate(CONTRAST);
    const c = coverage.get(scheme) ?? { measured: 0, screens: 0, painted: new Set() };
    c.measured += measured;
    c.screens += 1;
    c.painted.add(theme);
    coverage.set(scheme, c);
    for (const f of findings) {
      const key = `${scheme}|${f.cls}|${f.text}`;
      if (!seen.has(key)) seen.set(key, { ...f, scheme, where: label });
    }
  };

  await walkScreens({ page, BASE, step, width: 390, settings });
  await context.close();
}

await browser.close();

const rows = [...seen.values()].sort((a, b) => a.got - b.got);

// Grouped first: the same colour pair failing in twenty places is one fix, and
// a flat list of twenty invites twenty patches.
const byPair = new Map();
for (const r of rows) {
  const k = `${r.scheme.padEnd(5)} fg[${r.fg}] on bg[${r.bg}]`;
  if (!byPair.has(k)) byPair.set(k, { n: 0, worst: r.got, cls: new Set() });
  const e = byPair.get(k);
  e.n += 1;
  e.worst = Math.min(e.worst, r.got);
  e.cls.add(r.cls.split(' ')[0]);
}

const rule = '='.repeat(64);
if (byPair.size) {
  console.log(`\n${rule}\n  BY COLOUR PAIR — each line is one fix\n${rule}`);
  for (const [k, v] of [...byPair.entries()].sort((a, b) => b[1].n - a[1].n)) {
    console.log(`  ${String(v.n).padStart(3)}x  worst ${String(v.worst).padStart(5)}:1   ${k}`);
    console.log(`        ${[...v.cls].slice(0, 10).join(', ')}`);
  }
}

console.log(`\n${rule}\n  BELOW WCAG MINIMUM\n${rule}`);
if (!rows.length) console.log('  clean');
for (const r of rows) {
  console.log(`  ${r.scheme.padEnd(5)} ${String(r.got).padStart(5)}:1 (needs ${r.need})  ${r.size}px/${r.weight}  .${r.cls}`);
  console.log(`         "${r.text}"  @ ${r.where}`);
}

console.log(`\n${rule}\n  COVERAGE\n${rule}`);
for (const [scheme, c] of coverage) {
  console.log(`  ${scheme.padEnd(6)} ${String(c.measured).padStart(5)} elements over ${c.screens} screens   root class: ${[...c.painted].join(', ')}`);
}

for (const u of unreachable) console.log(`  ! unreachable: ${u}`);

const verdict = [];
if (rows.length) verdict.push(`${rows.length} below minimum`);
// A screen the script could not reach is a hole in the audit, not a pass.
if (unreachable.length) verdict.push(`${unreachable.length} screen(s) unreachable`);
const empty = [...coverage.entries()].filter(([, c]) => c.measured === 0).map(([t]) => t);
if (empty.length) verdict.push(`${empty.join(', ')} measured nothing`);
// Three themes painting the same root class means the seeding silently failed.
const painted = new Set([...coverage.values()].flatMap((c) => [...c.painted]));
if (coverage.size > 1 && painted.size < coverage.size) {
  verdict.push(`themes collapsed onto ${painted.size} palette(s): ${[...painted].join(', ')}`);
}
console.log(`\n${rule}\n  ${verdict.length ? verdict.join(', ') : 'Every measured element clears WCAG AA.'}\n${rule}`);
process.exit(verdict.length ? 1 : 0);
