/**
 * Renders public/og.png — the 1200×630 card that a shared trunk.golf link
 * unfurls into in iMessage, WhatsApp, Slack and the rest.
 *
 *   npm run og:image
 *
 * The committed og.png is the delivered brand card (BRAND.md). This script is
 * the fallback that draws a plain Trunk card from the brand constants: the
 * felt gradient, the Trunk mark (the same paths as trunk-mark.svg and the
 * index.html splash), the [mark] TRUNK lockup and the tagline. Running it
 * replaces the delivered card, so only run it when that is what you want.
 * Crawlers do not render SVG, so the PNG is what ships — committed, because
 * generating it at deploy time would need a browser in the Netlify build.
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
const RED = '#d2483b';

// The Trunk mark, exactly as trunk-mark.svg and the splash draw it (viewBox
// 140 130 744 754), with the currentColor body set in cream. Oswald's cap
// height is about 0.81em (the splash's figure of about 39px at 48px), so
// the 190px wordmark's caps are about 154px tall. 0.235 makes the mark
// 754·0.235 ≈ 177px tall, about 15% taller than that, as in the lockup, and
// sits its bottom on the wordmark baseline at y = 183 + 177 ≈ 360. It is
// 744·0.235 ≈ 175px wide, ending at x ≈ 287.
const MARK = `
  <g transform="translate(112 183) scale(0.235) translate(-140 -130)">
    <path fill="${CREAM}" fill-rule="evenodd" d="M296 162Q512 141 728 162C793 169 832 203 845 246Q855 279 821 276L739 400L792 516C849 523 870 604 870 722Q870 798 811 802V844Q811 870 784 870H718Q690 870 690 842V802H334V842Q334 870 306 870H240Q213 870 213 844V802C170 800 154 774 154 722C154 604 175 523 232 516L285 400L203 276Q169 279 179 246C192 203 231 169 296 162ZM243 246Q232 252 240 264L300 354Q302 358 311 354C431 315 593 315 713 354Q722 358 724 354L784 264Q792 252 781 246C688 207 336 207 243 246ZM329 391L275 520Q288 531 285 560V679Q285 721 326 721H698Q739 721 739 679V560Q736 531 749 520L695 391C583 354 441 354 329 391Z" />
    <path fill="${GOLD}" d="M443 658V417A20 20 0 1 1 474 408C544 395 562 458 644 452Q661 451 650 466C580 536 551 485 469 535V658C501 661 523 669 523 680C523 692 489 702 448 702S373 692 373 680C373 669 403 660 443 658Z" />
    <circle cx="587" cy="639" r="54" fill="${CREAM}" />
    <path fill="${RED}" d="M201 568H241Q256 568 256 583V669Q256 683 242 683H180Q164 683 167 667Q171 619 183 583Q188 568 201 568Z" />
    <path fill="${RED}" d="M783 568H823Q836 568 841 583Q853 619 857 667Q860 683 844 683H782Q768 683 768 669V583Q768 568 783 568Z" />
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
  <!-- The wordmark: [mark] TRUNK, set in full beside the mark with a 0.25em
       gap (0.25 × 190 ≈ 47px after the mark's right edge at 287),
       baseline level with the mark's bottom edge. -->
  <text x="334" y="360" font-size="190" font-weight="600" fill="${CREAM}" letter-spacing="11">TRUNK</text>
  <text x="124" y="470" font-size="78" font-weight="500" fill="${GOLD}">Settle it at the trunk.</text>
  <text x="124" y="564" font-size="30" font-weight="500" fill="${CREAM}" opacity="0.78" letter-spacing="1">
    GOLF SIDE GAMES · NO ACCOUNT · WORKS OFFLINE · TRUNK.GOLF
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
