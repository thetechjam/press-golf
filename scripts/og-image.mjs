/**
 * Renders public/og.png — the 1200×630 card that a shared pressgolf link
 * unfurls into in iMessage, WhatsApp, Slack and the rest.
 *
 *   npm run og:image
 *
 * The card is drawn here as SVG from the brand constants (BRAND.md): the felt
 * gradient, the P Flag mark lifted from index.html's splash, the wordmark
 * lockup where the mark stands in for the P, and the tagline. Crawlers do not
 * render SVG, so the PNG is what ships — committed, because generating it at
 * deploy time would need a browser in the Netlify build.
 *
 * Rasterised by a headless Chromium rather than an SVG library, for one
 * reason: the wordmark is Oswald, the app's own self-hosted woff2, and a
 * browser is the only renderer here that honours @font-face. Playwright is
 * used when it is installed (it is deliberately not a dependency — see the
 * README's audit section), otherwise a Chromium or Chrome on PATH, or the one
 * named by $CHROME. Regenerate whenever the mark, the colours or the tagline
 * change, and commit the result.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

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
const GOLD_DEEP = '#c69a2b';

// The P Flag mark, exactly as the splash draws it (viewBox 100 64 336 384 in
// index.html), placed and scaled by the group transform below. 0.68 puts its
// pole at 261px tall, which the wordmark's cap height is sized to match.
const MARK = `
  <g transform="translate(112 132) scale(0.68) translate(-100 -64)">
    <path d="M154 84 C270 90 352 116 404 162 Q420 178 404 194 C352 240 270 266 154 272 Z" fill="${GOLD}" />
    <path d="M154 84 C270 90 352 116 404 162 Q420 178 404 194 C352 240 270 266 154 272 Z"
          fill="none" stroke="${GOLD_DEEP}" stroke-width="7" stroke-linejoin="round" />
    <rect x="118" y="84" width="36" height="344" rx="18" fill="${CREAM}" />
    <circle cx="268" cy="178" r="58" fill="${CREAM}" />
    <circle cx="268" cy="178" r="49" fill="none" stroke="${GREEN_700}" stroke-width="16"
            stroke-dasharray="18 20.5" stroke-dashoffset="9" transform="rotate(-90 268 178)" />
    <g fill="#ccd8cf">
      <circle cx="268" cy="145" r="5.5" />
      <circle cx="257" cy="161" r="5.5" /><circle cx="279" cy="161" r="5.5" />
      <circle cx="246" cy="178" r="5.5" /><circle cx="268" cy="178" r="5.5" /><circle cx="290" cy="178" r="5.5" />
      <circle cx="257" cy="195" r="5.5" /><circle cx="279" cy="195" r="5.5" />
      <circle cx="268" cy="211" r="5.5" />
    </g>
  </g>`;

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
  ${MARK}
  <!-- The wordmark: the mark is the P, so only RESS is set, baseline on the
       pole's foot (y = 132 + 344·0.68 ≈ 393) and tight against the flag. -->
  <text x="350" y="393" font-size="330" font-weight="600" fill="${CREAM}" letter-spacing="-4">RESS</text>
  <text x="124" y="500" font-size="78" font-weight="500" fill="${GOLD}">Settle it on 18.</text>
  <text x="124" y="564" font-size="30" font-weight="500" fill="${CREAM}" opacity="0.78" letter-spacing="1">
    GOLF SIDE GAMES · NO ACCOUNT · WORKS OFFLINE · PRESSGOLF.NETLIFY.APP
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
