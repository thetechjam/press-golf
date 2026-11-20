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

The shipped mark is the **dimensional cut** (take A, "soft 3D"): a cream body
with a soft top-light gradient and a shaded underside to the raised lid, the
cavity darkened, a metallic gold flag, a lit ball, glossy taillights and a soft
drop shadow. The earlier flat glyph was rejected as too flat; it survives only
in the source files and the OG fallback script.

Mark colours: body and ball are cream `#f4f7f2` (shaded, never recoloured to
follow the theme), the flag is money gold `#e7b53c` (gradient `#f6e19a` →
`#c49218`), the taillights are red `#d2483b` (gradient `#f06a5c` → `#9e2b22`).

Icon felt is **`#023d33`**, sampled from the approved take-A art. The two SVG
tiles, the maskable PNGs and the Capacitor `icon-background` are flat
`#023d33`. The "any" PNGs (`icon-192`, `icon-512`, `apple-touch-icon`) and
`docs/brand/icon-1024.png` / `capacitor/icon-only.png` instead sit on a
full-bleed felt gradient sampled from take A — the same family, slightly
lighter at the top and darker at the bottom (corners about `rgb(8,71,58)`
top-left and `rgb(0,52,43)` bottom-left), with a soft contact shadow under the
car and no baked rounded tile. It is not a token: `--green-900` `#0b3d2e` stays the ink and UI deep green (splash,
manifest `background_color`, share cards).

### Three cuts

| Cut | Where | Rules |
|---|---|---|
| Full | `public/app-icon.svg` | 512×512 viewBox, squircle `rx="112"` on felt `#023d33` (faint radial lift), dimensional cream mark. Manifest `any` SVG icon. |
| Favicon | `public/favicon.svg` | Same tile, mark drawn slightly larger with a tighter shadow so it holds up at 16–32px. |
| In-app | `TrunkMark` in `src/icons.tsx` and the `index.html` splash, both showing `public/mark-3d.png` | The photographic take-A cut-out, transparent, no tile (143×144). Cream reads on light, dark and glare. `TrunkMark` props `size` (height), `className`; always `aria-hidden` with empty `alt`. |

The two SVG tiles are true vectors built from
`docs/brand/source/mark-dimensional-cream.svg` (viewBox `140 130 744 754`; the
flat path data plus gradients and a shadow, with `ai-` / `fi-` prefixed IDs).
The PNG icons and `mark-3d.png` are cut from the take-A raster. If the mark
changes, keep in sync: `public/mark-3d.png` (used by `TrunkMark` and the
splash), `public/app-icon.svg`, `public/favicon.svg`, the PNGs below and
`docs/brand/icon-1024.png` plus `docs/brand/capacitor/`.
The delivered `public/og.png` still shows the earlier flat mark — it was left
unchanged on purpose in the take-A pass and is not in sync with the
dimensional mark. `scripts/og-image.mjs` also still carries the flat path in
cream for its fallback card; it is only run if `og.png` is ever regenerated.

### Files

| File | Use |
|---|---|
| `public/app-icon.svg` | Full cut on the felt squircle. Manifest `any` icon, `sizes: any`. |
| `public/favicon.svg` | Favicon cut. Browser tab, `public/privacy.html`. |
| `public/icon-192.png`, `public/icon-512.png` | Manifest icons, `purpose: any`. Take-A cut-out on the full-bleed felt gradient; opaque, full square, no rounded corners. |
| `public/icon-maskable-192.png`, `public/icon-maskable-512.png` | Manifest icons, `purpose: maskable`. Full-bleed felt, Flat `#023d33`, mark at about 66% width so its farthest pixel stays inside the central 80% circle (the boxy car cannot sit at 70% — the wheels poke out). |
| `public/apple-touch-icon.png` | 180×180 opaque full square on the felt gradient (iOS rounds it; it ignores SVG touch icons). |
| `public/og.png` | 1200×630 link-preview card: the earlier flat cream mark (not updated to take A, on purpose), `TRUNK` and "Settle it at the trunk." on felt, with an illustrated open trunk in a clubhouse lot at the right. `scripts/og-image.mjs` draws a plainer fallback card (lockup, tagline, footer) if it ever needs regenerating. |
| `public/mark-3d.png` | 143×144 (~27 KB) transparent dimensional mark, no tile. Home header (via `TrunkMark`) and splash. |
| `src/icons.tsx` → `TrunkMark` | In-app mark: an `<img>` of `mark-3d.png`. |
| `index.html` splash | `<img src="/mark-3d.png">` (preloaded in the `<head>`) plus the cream word, on the felt gradient; shows before any script runs. |

All icon PNGs are opaque RGB with square corners — the "any" set on the felt
gradient, the maskable set on flat `#023d33` — built from the transparent
take-A cut-out, with no baked rounded tile; the OS does the rounding.
PNG sizes are asserted in `src/siteMeta.test.ts`. Regenerate them at exact
pixel sizes if the mark changes.

### Wordmark lockup

`[mark] TRUNK` — the mark sits to the left of the full word; it no longer
stands in for a letter.

- Word in Oswald 600, uppercase, `letter-spacing: 0.06em`.
- Mark height = cap height plus about 15%, mark bottom on the text baseline,
  gap of 0.25em.
- The word is real text, so the accessible name is just "Trunk" — no
  `aria-label` or hidden fragments.
- Used on the Home header and the splash. Share cards carry the word only.
- Home (treatment A): mark at 42px with a soft green drop shadow; the word in
  `--green-ink` with an embossed `text-shadow` (white bevel above, faint
  green edge and soft fall below). Dark mode inverts the emboss to a faint
  highlight and black depth; glare uses the light treatment. The effects sit
  on `.logo-mark` / `.logo-type`, never on `.logo`, so nothing clips the mark.
- Splash: mark at 48px, cream word with a soft shadow only — no green emboss
  on the dark felt.

## Color

Unchanged from Press. Defined as CSS custom properties in
`src/styles/01-base.css`; the share cards repeat them as constants in
`src/shareCanvas.ts`.

| Token | Hex | Role |
|---|---|---|
| `--green-900` | `#0b3d2e` | Deep felt — ink, splash, share-card and OG ground, manifest background. Icon tiles use the take-A felt `#023d33` instead (see the mark). |
| `--green-700` | `#14694e` | Brand green — theme colour, splash gradient top |
| `--fairway` | `#2fbf86` | Bright green — dark-mode accent and focus |
| `--cream` | `#f4f7f2` | Ball white — mark body, light text |
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
- Don't recolour the flag or taillights, rotate or outline the mark, and don't
  flatten it back to a single-colour glyph or add effects beyond its own
  shading and soft shadow. Don't
  set the wordmark in any face but Oswald.
- Don't pair the mark with the old "ress" fragment or any P-shaped flag.
- Don't add The Tech JAM branding; Trunk is its own thing.
