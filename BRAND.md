# Press — Brand One-Pager

The identity leans into what the app referees: buddies-trip money games where
nobody plays for free. Golf sets the scene; the bet is the point.

## Name

**Press.** A press is doubling the bet — the core move in golf side games.
Public title: "Press — Golf Side Games". Home-screen / short name: "Press".

## The mark: "P Flag"

The pin flag forms the letter **P** (pole = stem, gold pennant = bowl), and a
**poker-chip golf ball** — chip edge spots outside, dimples inside — sits in
the flag. Reading order is the brand order: P for Press first, pin flag
second, chip third. The pennant keeps its point; it's only rounded enough to
suggest the P.

### Files

| File | Use |
|---|---|
| `public/app-icon.svg` | Full mark on the felt squircle. Manifest `any` icon. |
| `public/favicon.svg` | Simplified cut (no dimples/shadows, bolder forms) for 16–32px. |
| `public/icon-192.png`, `public/icon-512.png` | PWA manifest icons (`any maskable`), rendered full-square. |
| `public/apple-touch-icon.png` | 180px full-square PNG (iOS ignores SVG touch icons). |
| `src/icons.tsx` → `PressMark` | In-app mark, no background tile. Flag stays gold; pole + chip ring follow `currentColor` so it tracks dark/glare modes. |
| `index.html` splash | Inline copy of the mark (splash background is already the felt). |

### Wordmark lockup

In the wordmark, **the mark replaces the P**: `[P Flag]RESS`. The mark's
bottom edge sits on the text baseline (`align-items: baseline`) with a tight
gap (3–5px) so the flag tip runs against the R. Keep "Press" available to
screen readers (`role="img" aria-label="Press"` on the lockup, `aria-hidden`
on the visible "ress"). Used on the Home header and the splash.

Regenerate the PNGs from the SVG art at exact pixel sizes if the mark changes
(the full-square render source lives in the SVG minus the `rx` on the
background rect).

## Color

Defined as CSS custom properties in `src/index.css`; the share card
(`src/shareCard.ts`) repeats them as constants.

| Token | Hex | Role |
|---|---|---|
| `--green-900` | `#0b3d2e` | Deep felt — splash/share-card ground |
| `--green-700` | `#14694e` | Brand green — theme color, chip edge spots |
| `--fairway` | `#2fbf86` | Bright green — dark-mode logo/accents |
| `--cream` | `#f4f7f2` | Ball white — pole, chip body, light text |
| `--gold` | `#e7b53c` | Money gold — the flag, trim, leaders |
| (icon only) | `#c69a2b` | Deep gold — flag outline |

## Type

**Oswald 500/600** (self-hosted latin subset) is the display face — the
clubhouse-scoreboard look. Uppercase for wordmark and scoreboard rows. System
sans for body text.

## Voice / tagline

Current line: **"Track golf side games — the fun way."**

Parked candidates (degenerate-buddies-trip energy — see ROADMAP):
"Settle it on 18." · "Nobody plays for free." · "Every hole's a bet." ·
"Keep your friends honest."

## Usage notes

- The mark never appears on a non-felt background without its squircle tile;
  in-app, use `PressMark` (transparent) on brand surfaces only.
- Share cards sign off with `SCORED WITH PRESS` in gold — keep that.
- Don't add The Tech JAM branding; Press is its own thing.
