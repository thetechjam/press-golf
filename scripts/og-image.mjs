/**
 * Renders public/og.png — the 1200×630 card that a shared trunk.golf link
 * unfurls into in iMessage, WhatsApp, Slack and the rest.
 *
 *   npm run og:image
 *
 * The card is the take-A lockup (BRAND.md): the photographic 3D mark beside
 * the embossed TRUNK wordmark, "Settle it at the trunk." in gold and a quiet
 * footer, centred on the felt gradient the splash uses. The mark is a
 * photograph, so the card is a small HTML page rather than an SVG: it shows
 * docs/brand/source/mark-3d-full.png (the 656×661 transparent take-A cut-out —
 * public/mark-3d.png is the 143px one the app ships, too small for a 210px
 * mark) and sets the type in the app's own self-hosted Oswald. Crawlers need
 * a PNG, so the PNG is what ships — committed, because generating it at
 * deploy time would need a browser in the Netlify build.
 *
 * Rasterised by a headless Chromium, the only renderer here that honours
 * @font-face and CSS filters. Playwright is used when it is installed (it is
 * deliberately not a dependency — see the README's audit section), otherwise
 * a Chromium or Chrome on PATH, or the one named by $CHROME. Regenerate
 * whenever the mark, the colours or the tagline change, and commit the result.
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
const MARK = pathToFileURL(path.join(root, 'docs', 'brand', 'source', 'mark-3d-full.png')).href;

// BRAND.md
const GREEN_900 = '#0b3d2e';
const GREEN_700 = '#14694e';
const CREAM = '#f4f7f2';
const GOLD = '#e7b53c';

// The Home/splash lockup at card size: mark about 210px tall, a 0.25em gap,
// baselines level. The wordmark's emboss is the dark-felt one (a faint light
// top edge, a hard dark step, a soft cast shadow), not the light-mode bevel.
// Everything sits centred with wide margins, so square and 1.91:1 crops in
// the various chat apps keep the whole lockup.
const html = `<!doctype html>
<meta charset="utf-8">
<style>
  @font-face {
    font-family: Oswald;
    src: url('${FONT}') format('woff2');
    font-weight: 200 700;
  }
  html, body { margin: 0; width: ${W}px; height: ${H}px; overflow: hidden; }
  body {
    background: linear-gradient(160deg, ${GREEN_700}, ${GREEN_900});
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    font-family: Oswald, 'Arial Narrow', sans-serif;
    color: ${CREAM};
  }
  .lockup { display: flex; align-items: baseline; gap: 0.25em; font-size: 200px; }
  .lockup img {
    height: 210px;
    width: auto;
    filter: drop-shadow(0 8px 18px rgba(0, 0, 0, 0.35));
  }
  .word {
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    line-height: 1;
    text-shadow:
      0 1px 0 rgba(255, 255, 255, 0.18),
      0 2px 0 rgba(0, 0, 0, 0.28),
      0 14px 28px rgba(0, 0, 0, 0.35);
  }
  .tag {
    margin-top: 18px;
    font-size: 44px;
    font-weight: 500;
    color: ${GOLD};
    letter-spacing: 0.01em;
    text-shadow: 0 2px 10px rgba(0, 0, 0, 0.28);
  }
  .foot {
    margin-top: 36px;
    font-size: 22px;
    font-weight: 500;
    letter-spacing: 0.12em;
    opacity: 0.72;
  }
</style>
<div class="lockup">
  <img src="${MARK}" alt="">
  <span class="word">Trunk</span>
</div>
<div class="tag">Settle it at the trunk.</div>
<div class="foot">GOLF SIDE GAMES · TRUNK.GOLF</div>
`;

const tmp = path.join(root, 'node_modules', '.tmp');
mkdirSync(tmp, { recursive: true });
const htmlPath = path.join(tmp, 'og.html');
writeFileSync(htmlPath, html);
const url = pathToFileURL(htmlPath).href;

let how = null;

// 1. Playwright, if somebody has installed it for the audits.
try {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  await page.goto(url);
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => Promise.all([...document.images].map((i) => i.decode())));
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
          // Lets the font and the mark finish loading before the capture.
          '--virtual-time-budget=5000',
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
