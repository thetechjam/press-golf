# Trunk brand source files

Generated with Higgsfield (GPT Image 2.6) in November 2026 for the Press → Trunk
rename, then cut and resized with `sharp`. `BRAND.md` at the repo root is the
brand guide; this folder keeps the source art. Nothing here is served or bundled.

The shipped look is take A, "soft 3D": a dimensional cream car on felt
`#023d33` (sampled from the take-A art; the token `--green-900` `#0b3d2e` stays
the ink green). The raster icons, `icon-1024.png` and `capacitor/` are built
from the transparent take-A cut-out, with no baked rounded tile, so every
opaque icon is a full square. The "any" icons, `icon-1024.png` and
`capacitor/icon-only.png` put it on a full-bleed felt gradient sampled from
take A (same family as `#023d33`, slightly lighter at the top, darker at the
bottom) with a soft contact shadow; the maskable icons and
`capacitor/icon-background.png` are flat `#023d33`.

| Path | What it is |
|---|---|
| `source/higgsfield-original.svg` | The vector mark exactly as Higgsfield returned it (1024 viewBox, taillights `#ed3732`). |
| `source/mark-dimensional-cream.svg` | The dimensional vector mark: cream body gradient, shaded lid underside, darkened cavity, metallic gold flag, lit ball, glossy taillights, soft drop shadow. Source of `public/app-icon.svg` and `public/favicon.svg`. |
| `source/mark-dimensional-ink.svg` | Same treatment with a green body, for light grounds. Not shipped. |
| `source/trunk-mark.svg` | The earlier flat mark (body and ball `currentColor`). Superseded; kept for the path data, which `scripts/og-image.mjs` still uses for its fallback card. |
| `source/trunk-mark-cream.svg` | Same mark with a cream `#f4f7f2` body, for felt surfaces. |
| `source/trunk-mark-on-light.svg` | Same mark with a deep green `#0b3d2e` body, for light surfaces. |
| `source/icon-full.svg`, `source/icon-maskable.svg`, `source/cap-foreground.svg` | Flat-mark sources for the previous icon set. Superseded by the take-A rasters; kept for reference. |
| `icon-1024.png` | 1024 px take-A master for stores and marketing, opaque full square on the full-bleed felt gradient. |
| `capacitor/` | Take-A inputs for `@capacitor/assets` if a native shell is created: `icon-only` (opaque, felt gradient), `icon-foreground` (transparent, mark sized to the 66dp-on-108dp adaptive safe circle — farthest pixel within about 0.306 of the side from centre, roughly 51% width), `icon-background` (flat `#023d33`), 2732 px splashes (the cut-out on full-bleed felt). Not used by the web build. |
| `mockups/` | AI mockups of Home, scoring and settle-up used as visual direction. Not a spec; the app's layouts did not change. |
| `runner-up/` | Options that were considered and not picked. |

The shipped files in `public/` and what they come from:

- `app-icon.svg`, `favicon.svg`: built from `source/mark-dimensional-cream.svg`
  on a `#023d33` `rx="112"` tile.
- `icon-192.png`, `icon-512.png`, `apple-touch-icon.png` (180): take-A cut-out
  on the full-bleed felt gradient, opaque RGB full squares, no rounded corners.
- `icon-maskable-192.png`, `icon-maskable-512.png`: the cut-out mark at about
  66% width on flat `#023d33`, so its farthest pixel stays inside the 80%
  maskable circle (the boxy car cannot sit at 70%).
- `mark-3d.png`: the transparent take-A cut-out (143×144, ~27 KB) shown by `TrunkMark`
  on Home and by the `index.html` splash.

`og.png` is the delivered raster card; there is no vector source. It was left
unchanged on purpose for take A, so the card itself still shows the earlier
flat mark (not only the `scripts/og-image.mjs` fallback).

`capacitor/splash-dark.png` is intentionally identical to `capacitor/splash.png`: the ground is dark felt either way.
