# Trunk — Brand One-Pager

Trunk (formerly Press) referees buddies-trip money games. Golf sets the scene;
the bet is the point, and the bet gets paid where every round really ends — in
the parking lot, at the trunk of the car.

## Name

**Trunk.** Capital T, no article, no "Golf" suffix in running text ("Trunk
Golf" is only the domain, [trunk.golf](https://trunk.golf)).

- Public title: "Trunk — Golf Side Games". Home-screen / short name: "Trunk".
- Uppercase `TRUNK` only in the wordmark and on share cards.
- In long-form docs the first mention is "Trunk (formerly Press)". Never in
  the app UI.
- The golf bet "press" keeps its name. Keep it lowercase wherever the copy
  allows, so it doesn't read as the old app name.

## Tagline and voice

Tagline: **"Settle it at the trunk."** — with the full stop. Used on the Home
header, the link-preview card (`og.png`) and its alt text.

Descriptor: **"Golf side games"**. Used on the splash, in page titles and in
the manifest.

Voice: plain, dry, buddies-trip money games. Never "simply", never "seamless".
"Settle it on 18." is retired. Still parked: "Nobody plays for free." ·
"Every hole's a bet." · "Keep your friends honest."

## The mark: "Open Trunk"

A car seen from behind with the trunk lid raised, a **gold pin flag** standing
up out of the trunk and a **ball** beside it, between two red taillights. The
gold flag is the one element carried over from the old Press identity.

Mark colours: body and ball are cream (or `currentColor` in-app), the flag is
always money gold `#e7b53c`, the taillights are always red `#d2483b`.

### Three cuts

| Cut | Where | Rules |
|---|---|---|
| Full | `public/app-icon.svg` | 512×512 viewBox, squircle `rx="112"` on flat deep felt `#0b3d2e`, cream mark. Manifest `any` SVG icon. |
| Favicon | `public/favicon.svg` | Same tile, mark drawn slightly larger so it holds up at 16–32px. |
| In-app | `TrunkMark` in `src/icons.tsx`; inline copy in the `index.html` splash and `scripts/og-image.mjs` | Transparent, no tile. Body and ball are `currentColor` so the mark follows light, dark and glare; flag `#e7b53c` and taillights `#d2483b` are fixed. Props `size`, `className`; `aria-hidden`. |

All three use the same path data from the delivered vector
(`docs/brand/source/trunk-mark.svg`, viewBox `140 130 744 754`). The path data
lives in five files: `src/icons.tsx`, `index.html`, `scripts/og-image.mjs`,
`public/app-icon.svg` and `public/favicon.svg`. If the mark changes, update all
five together, then the PNGs below.

### Files

| File | Use |
|---|---|
| `public/app-icon.svg` | Full cut on the felt squircle. Manifest `any` icon, `sizes: any`. |
| `public/favicon.svg` | Favicon cut. Browser tab, `public/privacy.html`. |
| `public/icon-192.png`, `public/icon-512.png` | Manifest icons, `purpose: any`. Opaque, full square, no rounded corners. |
| `public/icon-maskable-192.png`, `public/icon-maskable-512.png` | Manifest icons, `purpose: maskable`. Full-bleed felt, all art inside the central 80% circle (mark at about 70%). |
| `public/apple-touch-icon.png` | 180×180 opaque full square (iOS rounds it; it ignores SVG touch icons). |
| `public/og.png` | 1200×630 link-preview card: cream mark, `TRUNK` and "Settle it at the trunk." on felt, with an illustrated open trunk in a clubhouse lot at the right. `scripts/og-image.mjs` draws a plainer fallback card (lockup, tagline, footer) if it ever needs regenerating. |
| `src/icons.tsx` → `TrunkMark` | In-app mark, no tile. |
| `index.html` splash | Inline in-app mark plus the word, on the felt gradient. |

PNG sizes are asserted in `src/siteMeta.test.ts`. Regenerate them at exact
pixel sizes from the SVG art if the mark changes.

### Wordmark lockup

`[mark] TRUNK` — the mark sits to the left of the full word; it no longer
stands in for a letter.

- Word in Oswald 600, uppercase, `letter-spacing: 0.06em`.
- Mark height = cap height plus about 15%, mark bottom on the text baseline,
  gap of 0.25em.
- The word is real text, so the accessible name is just "Trunk" — no
  `aria-label` or hidden fragments.
- Used on the Home header and the splash. Share cards carry the word only.

## Color

Unchanged from Press. Defined as CSS custom properties in
`src/styles/01-base.css`; the share cards repeat them as constants in
`src/shareCanvas.ts`.

| Token | Hex | Role |
|---|---|---|
| `--green-900` | `#0b3d2e` | Deep felt — icon tiles, splash, share-card and OG ground, manifest background |
| `--green-700` | `#14694e` | Brand green — theme colour, splash gradient top |
| `--fairway` | `#2fbf86` | Bright green — dark-mode accent and focus |
| `--cream` | `#f4f7f2` | Ball white — mark body on felt, light text |
| `--gold` | `#e7b53c` | Money gold — the flag, trim, share-card wordmark and sign-off |
| `--over` | `#d2483b` | Over par; also the mark's taillights (fixed in every cut) |

## Type

**Oswald 500/600** (self-hosted latin subset, `public/fonts/oswald-latin.woff2`)
is the display face — the clubhouse-scoreboard look, and "TRUNK" sets well in a
condensed face. Uppercase for the wordmark and scoreboard rows. System sans for
body text. No other faces, no remote fonts.

## Share cards

- Header: `TRUNK` in gold, text only — no mark on cards.
- Image sign-off: `SCORED WITH TRUNK · TRUNK.GOLF` in gold.
- Text shares end `via Trunk · trunk.golf` (results) and
  `Scored with Trunk · trunk.golf` (trips).

## Usage notes

- The full and favicon cuts always sit on their felt tile. In-app, use
  `TrunkMark` (transparent) on brand surfaces only: Home header, splash, OG
  card.
- Clear space of half the mark's width on all sides. Minimum size 16px for the
  favicon cut, 24px for the in-app cut.
- Don't recolour the flag or taillights, rotate, outline or add effects. Don't
  set the wordmark in any face but Oswald.
- Don't pair the mark with the old "ress" fragment or any P-shaped flag.
- Don't add The Tech JAM branding; Trunk is its own thing.
