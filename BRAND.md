# Trunk — Brand One-Pager

The identity leans into what the app referees: buddies-trip money games where
nobody plays for free. Golf sets the scene; the bet is the point.

## Name

**Trunk.** Public title: "Trunk — Golf Side Games". Home-screen / short name: "Trunk".

The product used to be called Press, after the press — doubling the bet, the
core move in these games. The bet is still called a press. The product name
is Trunk.

## The mark

A pin flag (pole and gold pennant) with a **poker-chip golf ball** in it —
chip edge spots outside, dimples inside. The pennant was drawn to suggest a
letter **P** when the product was called Press. It is a logo now, and sits
beside the word Trunk. It does not stand in for a letter.

### Files

| File | Use |
|---|---|
| `public/app-icon.svg` | Full mark on the felt squircle. Manifest `any` icon. |
| `public/favicon.svg` | Simplified cut (no dimples/shadows, bolder forms) for 16–32px. |
| `public/icon-192.png`, `public/icon-512.png` | PWA manifest icons (`any maskable`), rendered full-square. |
| `public/apple-touch-icon.png` | 180px full-square PNG (iOS ignores SVG touch icons). |
| `src/icons.tsx` → `TrunkMark` | In-app mark, no background tile. Flag stays gold; pole + chip ring follow `currentColor` so it tracks dark/glare modes. |
| `index.html` splash | Inline copy of the mark (splash background is already the felt). |

### Wordmark lockup

`[mark] TRUNK`. The mark's bottom edge sits on the text baseline
(`align-items: baseline`) with about a 10px gap, so the flag reads as a logo
and not as the first letter of the word. The visible word is "Trunk"
(uppercased in CSS). On Home that word is the `<h1>` text. On the splash the
lockup is `role="img" aria-label="Trunk"`, with the visible word
`aria-hidden`. Share cards draw the word `TRUNK` in gold.

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
  in-app, use `TrunkMark` (transparent) on brand surfaces only.
- Share cards sign off with `SCORED WITH TRUNK` in gold — keep that.
- Don't add The Tech JAM branding; Trunk is its own thing.
