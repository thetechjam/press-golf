/**
 * Writes the brand icons from the one copy of the mark's geometry
 * (src/trunkMark.ts):
 *
 *   public/app-icon.svg          the Trunk U on the felt squircle (manifest `any`)
 *   public/favicon.svg           the bumper mark, bold cut, for 16–32px tabs
 *   public/icon-192.png          PWA icons, rendered full-square (`any maskable`)
 *   public/icon-512.png
 *   public/apple-touch-icon.png  180px full-square; iOS ignores SVG touch icons
 *
 *   npm run brand:icons [-- --preview DIR]   # --preview also writes 64/48/32px
 *                                            # checks of the icon to DIR
 *
 * The PNGs are rasterised the way og-image.mjs does it: Playwright if it is
 * installed, otherwise a Chromium or Chrome on PATH (or $CHROME). Regenerate
 * and commit whenever the mark changes.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { trunkGlyph, trunkSvg } from '../src/trunkMark.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUB = path.join(root, 'public');

// BRAND.md
const CREAM = '#f4f7f2';
const GREEN_700 = '#14694e';
const GOLD = '#e7b53c';
const GOLD_DEEP = '#c69a2b';
const WELL = '#072a1f';
const DIMPLE = '#ccd8cf';

const FELT = `<defs><linearGradient id="felt" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#176e51"/><stop offset="1" stop-color="#0a3529"/></linearGradient></defs>`;
const squircle = (inner, rx = 112) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">\n${FELT}\n<rect width="512" height="512" rx="${rx}" fill="url(#felt)"/>\n${inner}\n</svg>\n`;

/* The app icon: the U alone on the squircle. The lid pokes above the cap
   line, so the glyph sits a touch low to centre the whole mark optically. */
const ICON_COLORS = { ink: CREAM, well: WELL, lid: GOLD, ball: CREAM, ring: GREEN_700, dimple: DIMPLE };
function appIcon(rx) {
  const h = 262;
  const g = trunkGlyph({ x: 256 - (h * 0.9) / 2, y: 142, h });
  return squircle(
    `<!-- The Trunk mark: the U of TRUNK as a car's trunk — gold lid hinged into\n     the left stem, the poker-chip golf ball in the well. Geometry from\n     src/trunkMark.ts; written by scripts/brand-icons.mjs. -->\n${trunkSvg(g, ICON_COLORS)}`,
    rx
  );
}

/* The favicon: the chip ball on a bumper line with the gold pennant behind it
   — the one cut that is still a white disc on a line with a gold corner at
   16px. Bold strokes, no dimples or spots. */
function favicon() {
  const bw = 44;
  const by = 392;
  const r = 108;
  const cx = 256;
  const cy = by - bw / 2 - r + 6;
  const pennant = 'M154 84 C270 90 352 116 404 162 Q420 178 404 194 C352 240 270 266 154 272 Z';
  const k = 170 / 250;
  let s = `<!-- Favicon: the bumper mark — chip ball on the bumper line, pennant\n     behind — the bold cut that survives 16px. Written by scripts/brand-icons.mjs. -->\n`;
  s += `<g transform="translate(0 21)">`;
  s += `<rect x="${cx - 14}" y="${cy - r - 80}" width="28" height="110" rx="14" fill="${CREAM}"/>`;
  s += `<g transform="translate(${cx + 10} ${cy - r - 76}) scale(${k}) translate(-154 -84)"><path d="${pennant}" fill="${GOLD}"/></g>`;
  s += `<line x1="92" y1="${by}" x2="420" y2="${by}" stroke="${CREAM}" stroke-width="${bw}" stroke-linecap="round"/>`;
  s += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${CREAM}"/>`;
  s += `<circle cx="${cx}" cy="${cy}" r="${(r * 49) / 58}" fill="none" stroke="${GREEN_700}" stroke-width="${(r * 22) / 58}"/>`;
  s += `</g>`;
  return squircle(s);
}

/* ---- rasterising ------------------------------------------------------ */

const tmp = path.join(root, 'node_modules', '.tmp');
mkdirSync(tmp, { recursive: true });

async function rasterise(svg, out, size) {
  const sized = svg.replace('width="512" height="512"', `width="${size}" height="${size}"`);
  const file = path.join(tmp, `${path.basename(out, '.png')}-${size}.svg`);
  writeFileSync(file, sized);
  const url = pathToFileURL(file).href;
  let how = null;
  try {
    const { chromium } = await import('playwright');
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
    await page.goto(url);
    await page.screenshot({ path: out, type: 'png' });
    await browser.close();
    how = 'playwright';
  } catch (err) {
    if (!/Cannot find (package|module) 'playwright'/.test(String(err))) throw err;
  }
  if (!how) {
    const candidates = [process.env.CHROME, 'chromium', 'chromium-browser', 'google-chrome', 'google-chrome-stable', 'chrome', 'brave'].filter(Boolean);
    for (const bin of candidates) {
      try {
        execFileSync(
          bin,
          ['--headless=new', '--no-sandbox', '--disable-gpu', '--hide-scrollbars', `--window-size=${size},${size}`, `--screenshot=${out}`, url],
          { stdio: 'ignore', timeout: 60_000 }
        );
        how = bin;
        break;
      } catch {
        // Not there, or failed to launch: try the next one.
      }
    }
  }
  if (!how || !existsSync(out)) {
    console.error(
      'This script needs a browser to rasterise the icons:\n' +
        '  npm install --no-save playwright && npx playwright install chromium\n' +
        'or a Chromium/Chrome on PATH (or CHROME=/path/to/chrome).'
    );
    process.exit(1);
  }
  const png = readFileSync(out);
  const w = png.readUInt32BE(16);
  const hgt = png.readUInt32BE(20);
  if (w !== size || hgt !== size) {
    console.error(`${path.relative(root, out)}: rendered ${w}×${hgt}, expected ${size}×${size}.`);
    process.exit(1);
  }
  console.log(`Wrote ${path.relative(root, out)} (${size}px, ${png.length} bytes) via ${how}.`);
}

const iconSvg = appIcon(112);
writeFileSync(path.join(PUB, 'app-icon.svg'), iconSvg);
writeFileSync(path.join(PUB, 'favicon.svg'), favicon());
console.log('Wrote public/app-icon.svg and public/favicon.svg.');

// Full-square renders: the manifest marks them maskable, so the platform
// applies its own shape and a baked-in corner radius would show as a gap.
const square = appIcon(0);
await rasterise(square, path.join(PUB, 'icon-512.png'), 512);
await rasterise(square, path.join(PUB, 'icon-192.png'), 192);
await rasterise(square, path.join(PUB, 'apple-touch-icon.png'), 180);

const previewAt = process.argv.indexOf('--preview');
if (previewAt !== -1) {
  const dir = path.resolve(process.argv[previewAt + 1] || path.join(tmp, 'icon-preview'));
  mkdirSync(dir, { recursive: true });
  for (const size of [64, 48, 32]) await rasterise(iconSvg, path.join(dir, `icon-${size}.png`), size);
  for (const size of [32, 16]) await rasterise(favicon(), path.join(dir, `favicon-${size}.png`), size);
}
