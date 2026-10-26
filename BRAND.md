# Trunk — Brand One-Pager

The identity leans into what the app referees: buddies-trip money games where
nobody plays for free. Golf sets the scene; the bet is the point.

## Name

**Trunk.** The round ends at the trunk of the car, where the money changes
hands. Public title: "Trunk — Golf Side Games". Home-screen / short name:
"Trunk". Store-style name, if one is ever needed: "Trunk: Golf Side Games".

The app was **Press** until October 2026 (a press is doubling the bet). The
old name survives where changing it would cost something: the `press.*`
storage keys, the backup file's `app: 'press'` stamp and the `press-feedback`
Netlify form. Nowhere a person reads it.

## The mark: the U is the trunk

TRUNK in Oswald 600 caps, where the **U is a drawn letter**: the stems and
bowl are the trunk's walls, the counter is the dark well, a **gold lid** is
hinged into the top of the left stem and raised at 24°, and the **poker-chip
golf ball** — chip edge spots outside, dimples inside — rests in the bottom of
the well. The name carries the mark: nothing has to sit beside the word, and
the idea (the round ends in the trunk) is told by the letter itself.

The lid is hinged *into* the stem, not laid on it: the hinge pin sits inside
the stroke below the cap line, the heel of the lid is cut into the stem, and a
sliver of well colour along the lid's underside is the slot it comes out of.

The geometry lives in **one file, `src/trunkMark.ts`**, sized from the cap
height: the glyph is 0.9× cap wide with a 0.22× cap stem (0.27× in the bold
cut), and the lid rises 0.28× cap above the cap line. Everything below draws
from it; change a proportion there and every rendering moves together.

### The favicon: chip on the bumper

At 16px a U with a lid is a slot with a line over it, so the tab icon is a
different cut: the chip ball sitting on a single bumper line with the gold
pennant on a short stub behind it. It is still a white disc on a line with a
gold corner at 16px, which is more than most favicons manage, and it keeps
both brand parts (ball, pennant). It is the favicon only — never the app icon,
the wordmark or a lockup.

### Files

| File | Use |
|---|---|
| `src/trunkMark.ts` | The geometry. `trunkGlyph()` for the numbers, `trunkSvg()` for SVG markup. |
| `public/app-icon.svg` | The U alone on the felt squircle. Manifest `any` icon. |
| `public/favicon.svg` | The bumper mark, bold cut, for 16–32px. |
| `public/icon-192.png`, `public/icon-512.png` | PWA manifest icons (`any maskable`), rendered full-square. |
| `public/apple-touch-icon.png` | 180px full-square PNG (iOS ignores SVG touch icons). |
| `src/icons.tsx` → `TrunkMark` | In-app mark, no background tile. Lid stays gold; stems, well and chip ring follow `currentColor` so it tracks dark/glare modes. No dimples at this size. |
| `index.html` splash | A static copy of the mark (splash background is already the felt). |
| `src/shareCanvas.ts` → `drawHeader` | The mark on the share cards, above the TRUNK wordmark. |
| `public/og.png` | The link-preview card: the wordmark, the tagline, the second line. |

`npm run brand:icons` writes the SVGs and renders the PNGs;
`npm run og:image` draws the preview card. Both run from `src/trunkMark.ts`
and need a browser (Playwright if installed, else a Chromium on PATH). Run
both and commit the results whenever the mark changes.

### Wordmark lockup

In the wordmark, **the mark replaces the U**: `TR[Trunk mark]NK`. The mark's
bottom edge sits on the text baseline (`align-items: baseline`) and its stems
rise to the cap line, so it is sized from Oswald's cap height (0.8125em: the
SVG is 1.04em tall including the lid, 0.73125em wide) and given the U's own
side bearings (0.047em) plus the letter-spacing the R would have carried after
it. Keep "Trunk" available to screen readers (`aria-label="Trunk"` on the
lockup, `aria-hidden` on the visible "TR" and "NK"). Used on the Home header
and the splash; the share cards and the OG card set the same lockup with the
glyph's real metrics.

## Color

Defined as CSS custom properties in `src/index.css`; the share card
(`src/shareCanvas.ts`) repeats them as constants. Unchanged by the rename.

| Token | Hex | Role |
|---|---|---|
| `--green-900` | `#0b3d2e` | Deep felt — splash/share-card ground |
| `--green-700` | `#14694e` | Brand green — theme color, chip edge spots |
| `--fairway` | `#2fbf86` | Bright green — dark-mode logo/accents |
| `--cream` | `#f4f7f2` | Ball white — stems, chip body, light text |
| `--gold` | `#e7b53c` | Money gold — the lid, the pennant, trim, leaders |
| (mark only) | `#072a1f` | The well — inside the U on the felt |
| (icon only) | `#c69a2b` | Deep gold — pennant outline where one is drawn |

## Type

**Oswald 500/600** (self-hosted latin subset) is the display face — the
clubhouse-scoreboard look. Uppercase for wordmark and scoreboard rows. System
sans for body text.

## Voice / lines

Tagline: **"Settle it at the trunk."**
Second line: **"Nobody plays for free."**

Both appear on the OG card; the tagline alone under the Home wordmark and on
the splash. "Track golf side games — the fun way." is retired. Still parked
for a launch post: "Every hole's a bet." · "Keep your friends honest."

## Usage notes

- The mark never appears on a non-felt background without its squircle tile;
  in-app, use `TrunkMark` (transparent) on brand surfaces only.
- Share cards sign off with `SETTLED AT THE TRUNK` in gold — keep that. The
  text settle-up ends "Settled at the Trunk".
- The bumper mark is the favicon and nothing else.
- Don't add The Tech JAM branding; Trunk is its own thing.
- Domain: **trunk.golf**, with trunkgolf.com and trunkgolf.app as redirects.
  Until they are live the app ships from pressgolf.netlify.app, which stays
  up as a redirect afterwards; the OG card names no domain so it survives the
  move.
