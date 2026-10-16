/**
 * Renders public/og.png — the 1200×630 card that a shared Trunk link unfurls
 * into in iMessage, WhatsApp, Slack and the rest.
 *
 *   npm run og:image
 *
 * The card is drawn here as SVG from the brand constants (BRAND.md): the felt
 * gradient, the wordmark with the Trunk mark standing in for the U (geometry
 * from src/trunkMark.ts, the same file the app and the icons draw from), the
 * tagline and the second line. Crawlers do not render SVG, so the PNG is what
 * ships — committed, because generating it at deploy time would need a
 * browser in the Netlify build.
 *
 * Rasterised by a headless Chromium rather than an SVG library, for one
 * reason: the wordmark is Oswald, the app's own self-hosted woff2, and a
 * browser is the only renderer here that honours @font-face. Playwright is
 * used when it is installed (it is deliberately not a dependency — see the
 * README's audit section), otherwise a Chromium or Chrome on PATH, or the one
 * named by $CHROME. Regenerate whenever the mark, the colours or the lines
 * change, and commit the result.
 *
 * The card names no domain on purpose: it is served from wherever the app
 * lives, and the move to trunk.golf should not need it redrawn.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { trunkGlyph, trunkSvg, GLYPH_W } from '../src/trunkMark.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const W = 1200;
const H = 630;
const OUT = path.join(root, 'public', 'og.png');
const FONT = pathToFileURL(path.join(root, 'public', 'fonts', 'oswald-latin.woff2')).href;

// BRAND.md
const GREEN_900 = '#0b3d2e';
const GREEN_700 = '#14694e';
const CREAM = '#f4f7f2';
const GOLD = '#e7b53c';
const WELL = '#072a1f';
const DIMPLE = '#ccd8cf';

// The wordmark: TR, the mark as the U, NK — set from Oswald 600's own metrics
// so nothing here has to be measured in a browser. Cap height is 0.8125em;
// "TR" advances 1.021em; the U has 0.047em side bearings, which the drawn
// glyph is given back on either side.
const F = 300;
const CAP = F * 0.8125;
const LEFT = 124;
const BASE = 352;
const UX = LEFT + F * (1.021 + 0.047);
const UW = CAP * GLYPH_W;
const MARK = trunkSvg(
  trunkGlyph({ x: UX, y: BASE - CAP, h: CAP }),
  { ink: CREAM, well: WELL, lid: GOLD, ball: CREAM, ring: GREEN_700, dimple: DIMPLE }
);

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <style>
    @font-face { font-family: Oswald; src: url('${FONT}') format('woff2'); font-weight: 200 700; }
    text { font-family: Oswald, 'Arial Narrow', sans-serif; }
  </style>
  <defs>
    <linearGradient id="felt" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${GREEN_700}" />
      <stop offset="1" stop-color="${GREEN_900}" />
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#felt)" />
  <text x="${LEFT}" y="${BASE}" font-size="${F}" font-weight="600" fill="${CREAM}">TR</text>
  ${MARK}
  <text x="${UX + UW}" y="${BASE}" font-size="${F}" font-weight="600" fill="${CREAM}">NK</text>
  <text x="${LEFT}" y="452" font-size="78" font-weight="500" fill="${GOLD}">Settle it at the trunk.</text>
  <text x="${LEFT}" y="512" font-size="44" font-weight="500" fill="${CREAM}" opacity="0.92">Nobody plays for free.</text>
  <text x="${LEFT}" y="576" font-size="28" font-weight="500" fill="${CREAM}" opacity="0.72" letter-spacing="1">
    GOLF SIDE GAMES · NO ACCOUNT · WORKS OFFLINE
  </text>
</svg>
`;

const tmp = path.join(root, 'node_modules', '.tmp');
mkdirSync(tmp, { recursive: true });
const svgPath = path.join(tmp, 'og.svg');
writeFileSync(svgPath, svg);
const url = pathToFileURL(svgPath).href;

let how = null;

// 1. Playwright, if somebody has installed it for the audits.
try {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  await page.goto(url);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: OUT, type: 'png' });
  await browser.close();
  how = 'playwright';
} catch (err) {
  if (!/Cannot find (package|module) 'playwright'/.test(String(err))) throw err;
}

// 2. A browser on the machine.
if (!how) {
  const candidates = [
    process.env.CHROME,
    'chromium',
    'chromium-browser',
    'google-chrome',
    'google-chrome-stable',
    'chrome',
    'brave',
  ].filter(Boolean);
  for (const bin of candidates) {
    try {
      execFileSync(
        bin,
        [
          '--headless=new',
          '--no-sandbox',
          '--disable-gpu',
          '--hide-scrollbars',
          `--window-size=${W},${H}`,
          `--screenshot=${OUT}`,
          url,
        ],
        { stdio: 'ignore', timeout: 60_000 }
      );
      how = bin;
      break;
    } catch {
      // Not there, or failed to launch: try the next one.
    }
  }
}

if (!how || !existsSync(OUT)) {
  console.error(
    'This script needs a browser to rasterise the card:\n' +
      '  npm install --no-save playwright && npx playwright install chromium\n' +
      'or a Chromium/Chrome on PATH (or CHROME=/path/to/chrome).'
  );
  process.exit(1);
}

// The IHDR chunk: width and height as big-endian uint32 at bytes 16 and 20.
const png = readFileSync(OUT);
const width = png.readUInt32BE(16);
const height = png.readUInt32BE(20);
if (width !== W || height !== H) {
  console.error(`Rendered ${width}×${height}, expected ${W}×${H}.`);
  process.exit(1);
}
console.log(`Wrote ${path.relative(root, OUT)} (${W}×${H}, ${png.length} bytes) via ${how}.`);
